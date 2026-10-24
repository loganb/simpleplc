class Poller
  POLL_INTERVAL = 1.second
  Schedule = Data.define(:due_at, :period)
  # Every this many cycles, the log gets a summary of cycle times.
  CYCLE_LOG_EVERY = 60

  # Per-transaction timeouts, applied to each client when it is opened.
  READ_RETRY_TIMEOUT = 0.5
  READ_RETRIES = 2

  # Serial-level failures. The port itself is gone (adapter unplugged, tty
  # died), so the connection is dropped and reopened next cycle. Modbus protocol
  # errors are deliberately *not* in this list: a timeout or a CRC mismatch means
  # one device is unhappy, not that the bus is dead.
  CONNECTION_ERRORS = [ SystemCallError, IOError ].freeze

  def initialize(clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
    # host_interface_id => Poller::Connection. Keyed by id rather than by record
    # so a development-mode class reload can't strand an open port behind a
    # stale HostInterface instance.
    @connections = {}
    @schedules = {}
    @clock = clock
    @stopping = false
    # Writes buffered during a cycle and persisted together at its end, so serial
    # IO never waits on the database and a cycle costs one commit.
    @pending = []
    @cycle_count = 0
    @cycle_total = 0.0
    @cycle_max = 0.0
  end

  # One RTUClient is held open per HostInterface across cycles, so the
  # half-duplex RS-485 bus is never accessed concurrently and the cost of
  # opening the adapter is paid once. See claude/interface-online-state.md.
  def run
    Rails.logger.info "Poller starting (interval: #{POLL_INTERVAL}s)"
    trap_signals
    # A scan still marked running was abandoned by the previous poller.
    Rails.application.reloader.wrap { HardwareScan.fail_running("Poller restarted") }

    until @stopping
      cycle_start = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      # Wrap each cycle in the Rails reloader so constants (driver classes, models)
      # are available and correctly reloaded in development between iterations.
      Rails.application.reloader.wrap { run_cycle }

      elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - cycle_start
      record_cycle_time(elapsed)
      sleep_for = POLL_INTERVAL.to_f - elapsed
      # A trapped signal wakes this early, so shutdown doesn't wait out the interval.
      sleep(sleep_for) if sleep_for > 0 && !@stopping
    end
  ensure
    shut_down
  end

  # Logs a warning when a cycle overruns POLL_INTERVAL (the next one starts
  # late), debug-logs every cycle, and info-logs a summary periodically.
  def record_cycle_time(elapsed)
    Rails.logger.warn format("Poller: cycle took %.3fs, over the %ss interval", elapsed, POLL_INTERVAL) if elapsed > POLL_INTERVAL
    Rails.logger.debug { format("Poller: cycle took %.3fs", elapsed) }
    @cycle_count += 1
    @cycle_total += elapsed
    @cycle_max = [ @cycle_max, elapsed ].max
    return unless (@cycle_count % CYCLE_LOG_EVERY).zero?

    Rails.logger.info format("Poller: last %d cycles averaged %.3fs, max %.3fs", CYCLE_LOG_EVERY, @cycle_total / CYCLE_LOG_EVERY, @cycle_max)
    @cycle_total = 0.0
    @cycle_max = 0.0
  end

  # One pass over every interface. Public because it is the poller's unit of
  # work — `run` is just the loop, the signal trap, and the sleep around it.
  # Database writes are buffered and committed in one transaction at the end.
  def run_cycle
    output_writer = Logic::OutputWriter.new
    output_commands_by_device_id = output_writer.enabled_commands_by_device_id

    interfaces = HostInterface.includes(:devices).to_a

    interfaces.each do |iface|
      iface.reload
      @schedules.delete(iface.id) unless iface.enabled?
      scan = iface.enabled? ? nil : iface.device_scans.find_by(state: "pending")
      if scan
        # The scan sweeps synchronously and needs the port to itself.
        release([ iface.id ])
        flush_pending
        iface.report_connection(online: false)
        HardwareScan.new(scan, stopping: -> { @stopping }).run
        next
      end
      connection = connection_for(iface)
      unless connection
        @schedules.delete(iface.id)
        next
      end

      connection.retain_drivers_for(iface.devices.map(&:id))
      schedule = @schedules[iface.id]
      if schedule && schedule.period == iface.update_period && @clock.call < schedule.due_at
        report_connection(iface, online: true)
        next
      end

      poll_interface(iface, connection, output_writer, output_commands_by_device_id)
      @schedules[iface.id] = Schedule.new(@clock.call + iface.update_period, iface.update_period) if @connections.key?(iface.id)
    end

    # Interfaces deleted since the last cycle still hold an open port.
    release(@connections.keys - interfaces.map(&:id))
    @schedules.delete_if { |id, _| interfaces.none? { |iface| iface.id == id } }
  ensure
    flush_pending
  end

  # Releases every held port and marks those buses offline, rather than leaving
  # a phantom `online` for the staleness window to expire.
  def shut_down
    HardwareScan.fail_running("Poller stopped")
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
      # Nothing to say about a bus already recorded as cleanly offline.
      report_connection(iface, online: false) if iface.online || iface.connection_error
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
    # Fully qualified: this instance outlives dev code reloads, and after one
    # the class it was built from no longer has a Connection constant.
    connection = ::Poller::Connection.open(iface, read_retry_timeout: READ_RETRY_TIMEOUT, read_retries: READ_RETRIES)
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

    report_connection(iface, online: true)
  rescue *CONNECTION_ERRORS => e
    # The port died mid-cycle. Drop it and let the next cycle reopen.
    release([ iface.id ])
    report_offline(iface, "#{e.class}: #{e.message}")
  end

  # Logs only on the transition into failure, so an unplugged adapter doesn't
  # write the same line every 10 seconds forever.
  def report_offline(iface, error)
    Rails.logger.error "Poller: #{iface.name} (#{iface.port}) offline: #{error}" if iface.online || iface.connection_error != error
    report_connection(iface, online: false, error: error)
  end

  def report_connection(iface, online:, error: nil)
    at = Time.current
    @pending << -> { iface.report_connection(online: online, error: error, at: at) }
  end

  def observe(device, attributes, identity)
    @pending << -> { device.persist_observation(attributes, identity: identity) }
  end

  # Persists the cycle's buffered writes in one async-commit transaction. Each
  # write has its own savepoint, so one that fails is logged and skipped
  # without rolling back the others.
  def flush_pending
    return if @pending.empty?

    writes, @pending = @pending, []
    ApplicationRecord.async_commit_transaction do
      writes.each do |write|
        ActiveRecord::Base.transaction(requires_new: true) { write.call }
      rescue => e
        Rails.logger.warn "Poller: dropped a buffered write: #{e.class}: #{e.message}"
      end
    end
  end

  def release(interface_ids)
    interface_ids.each do |id|
      @schedules.delete(id)
      connection = @connections.delete(id)
      connection&.close
    end
  end

  def poll_device(device, connection, output_writer, output_commands_by_device_id)
    identity = device.attributes.symbolize_keys.slice(:host_interface_id, :driver, :modbus_address)
    driver = nil
    state = begin
      driver = connection.driver_for(device)
      data = driver.read
      output_errors = []

      output_commands_by_device_id.fetch(device.id, []).each do |command|
        # Only relays whose read-back differs are written, to keep the cycle short.
        next unless output_writer.pending?(command, data)

        begin
          output_writer.write(driver, command)
        rescue *CONNECTION_ERRORS
          raise
        rescue => e
          connection.flush_line
          Rails.logger.warn "Poller: error writing output binding #{command.output_binding.id} to device #{device.id} channel #{command.channel}: #{e.message}"
          output_errors << {
            logic_output_binding_id: command.output_binding.id,
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
      # Before relocate, which transacts on the bus, and before the next device.
      connection.flush_line
      relocate(device, connection, driver)
      { polled_at: Time.now.utc.iso8601, status: "error", error: e.message, data: nil }
    end

    observe(device, { current_state: state, last_polled_at: Time.current }, identity)
  end

  # A driver that reprogrammed its module's address reports where the module
  # now answers (after a power cycle). Commit that and clear the address
  # setting, so a later manual correction of the address isn't overwritten by
  # the driver programming the stale value again.
  def relocate(device, connection, driver)
    address = driver&.relocated_address(connection.client)
    return unless address

    device.update!(modbus_address: address, settings: device.settings.except("address"))
    Rails.logger.info "Poller: device #{device.id} moved to address #{address}"
  rescue *CONNECTION_ERRORS
    raise
  rescue => e
    Rails.logger.warn "Poller: could not relocate device #{device.id}: #{e.message}"
  end
end
