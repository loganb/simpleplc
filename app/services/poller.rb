class Poller
  POLL_INTERVAL = 10 # seconds

  # Per-transaction timeouts, applied to each client when it is opened.
  READ_RETRY_TIMEOUT = 0.5
  READ_RETRIES = 2

  # Serial-level failures. The port itself is gone (adapter unplugged, tty
  # died), so the connection is dropped and reopened next cycle. Modbus protocol
  # errors are deliberately *not* in this list: a timeout or a CRC mismatch means
  # one device is unhappy, not that the bus is dead.
  CONNECTION_ERRORS = [ SystemCallError, IOError ].freeze

  def initialize
    # host_interface_id => Poller::Connection. Keyed by id rather than by record
    # so a development-mode class reload can't strand an open port behind a
    # stale HostInterface instance.
    @connections = {}
    @stopping = false
  end

  # One RTUClient is held open per HostInterface across cycles, so the
  # half-duplex RS-485 bus is never accessed concurrently and the cost of
  # opening the adapter is paid once. See claude/interface-online-state.md.
  def run
    Rails.logger.info "Poller starting (interval: #{POLL_INTERVAL}s)"
    trap_signals

    until @stopping
      cycle_start = Time.now

      # Wrap each cycle in the Rails reloader so constants (driver classes, models)
      # are available and correctly reloaded in development between iterations.
      Rails.application.reloader.wrap { run_cycle }

      elapsed = Time.now - cycle_start
      sleep_for = POLL_INTERVAL - elapsed
      # A trapped signal wakes this early, so shutdown doesn't wait out the interval.
      sleep(sleep_for) if sleep_for > 0 && !@stopping
    end
  ensure
    shut_down
  end

  # One pass over every interface. Public because it is the poller's unit of
  # work — `run` is just the loop, the signal trap, and the sleep around it.
  def run_cycle
    output_writer = Logic::OutputWriter.new
    output_commands_by_device_id = output_writer.enabled_commands_by_device_id

    interfaces = HostInterface.includes(:devices).to_a

    interfaces.each do |iface|
      iface.reload
      if !iface.enabled? && iface.scan_active?
        release([ iface.id ])
        iface.report_connection(online: false)
        HardwareScan.new(iface, stopping: -> { @stopping }).run
        next
      end
      connection = connection_for(iface)
      next unless connection

      connection.retain_drivers_for(iface.devices.map(&:id))
      poll_interface(iface, connection, output_writer, output_commands_by_device_id)
    end

    # Interfaces deleted since the last cycle still hold an open port.
    release(@connections.keys - interfaces.map(&:id))
  end

  # Releases every held port and marks those buses offline, rather than leaving
  # a phantom `online` for the staleness window to expire.
  def shut_down
    return if @connections.empty?

    Rails.logger.info "Poller: releasing #{@connections.size} port(s)"
    ids = @connections.keys
    release(ids)
    HostInterface.where(id: ids).find_each { |interface| interface.report_connection(online: false) }
  end

  private

  # Handlers only set a flag: database work and closing ports happen back in
  # normal code, where locking rules aren't restricted.
  def trap_signals
    %w[INT TERM].each do |signal|
      Signal.trap(signal) { @stopping = true }
    end
  end

  # Returns a usable connection for the interface, or nil when the bus should
  # not be polled this cycle (disabled, port missing, or failed to open).
  def connection_for(iface)
    unless iface.enabled
      # Disabling is a request the operator makes; this is where it takes effect.
      # `online: false` is written only after the port is actually closed, so
      # "offline" always means the bus is genuinely free.
      release([ iface.id ])
      iface.report_connection(online: false)
      return nil
    end

    existing = @connections[iface.id]
    return existing if existing&.usable_for?(iface)

    release([ iface.id ]) if existing

    unless iface.port_present?
      report_offline(iface, "port #{iface.port} is not present on this host")
      return nil
    end

    open_connection(iface)
  end

  def open_connection(iface)
    connection = Connection.open(iface, read_retry_timeout: READ_RETRY_TIMEOUT, read_retries: READ_RETRIES)
    @connections[iface.id] = connection

    # The `online: true` write is left to poll_interface at the end of the
    # cycle, so a bus only reports online once it has actually carried traffic.
    Rails.logger.info "Poller: opened #{iface.port} for #{iface.name}" unless iface.online
    connection
  rescue => e
    report_offline(iface, "#{e.class}: #{e.message}")
    nil
  end

  def poll_interface(iface, connection, output_writer, output_commands_by_device_id)
    iface.devices.each do |device|
      poll_device(device, connection, output_writer, output_commands_by_device_id)
    end

    iface.report_connection(online: true)
  rescue *CONNECTION_ERRORS => e
    # The port died mid-cycle. Drop it and let the next cycle reopen.
    release([ iface.id ])
    report_offline(iface, "#{e.class}: #{e.message}")
  end

  # Logs only on the transition into failure, so an unplugged adapter doesn't
  # write the same line every 10 seconds forever.
  def report_offline(iface, error)
    Rails.logger.error "Poller: #{iface.name} (#{iface.port}) offline: #{error}" if iface.online || iface.connection_error != error
    iface.report_connection(online: false, error: error)
  end

  def release(interface_ids)
    interface_ids.each do |id|
      connection = @connections.delete(id)
      connection&.close
    end
  end

  def poll_device(device, connection, output_writer, output_commands_by_device_id)
    identity = device.attributes.symbolize_keys.slice(:host_interface_id, :driver, :modbus_address)
    state = begin
      driver = connection.driver_for(device)
      data = driver.read
      output_errors = []

      output_commands_by_device_id.fetch(device.id, []).each do |command|
        begin
          output_writer.write(driver, command)
        rescue *CONNECTION_ERRORS
          raise
        rescue => e
          Rails.logger.warn "Poller: error writing output #{command.output_block.id} to device #{device.id} channel #{command.channel}: #{e.message}"
          output_errors << {
            output_block_id: command.output_block.id,
            channel: command.channel,
            desired_output: command.desired_output,
            error: e.message
          }
        end
      end

      status = output_errors.empty? ? "ok" : "error"
      error = output_errors.empty? ? nil : "one or more output writes failed"
      { polled_at: Time.now.utc.iso8601, status: status, error: error, data: data, output_write_errors: output_errors }
    rescue *CONNECTION_ERRORS
      # Not this device's fault — let poll_interface drop the whole bus.
      raise
    rescue => e
      Rails.logger.warn "Poller: error reading device #{device.id} (addr #{device.modbus_address}): #{e.message}"
      { polled_at: Time.now.utc.iso8601, status: "error", error: e.message, data: nil }
    end

    device.persist_observation({ current_state: state, last_polled_at: Time.current }, identity: identity)
  end
end
