# Device state polling daemon.
#
# Runs in a loop, reading state from every device on every HostInterface
# and writing the result into devices.current_state.
#
# Run via:
#   bundle exec rails runner lib/poller.rb
#
# One RTUClient is opened per HostInterface per cycle so the half-duplex
# RS-485 bus is never accessed concurrently.

POLL_INTERVAL = 10 # seconds

Rails.logger.info "Poller starting (interval: #{POLL_INTERVAL}s)"

loop do
  cycle_start = Time.now

  # Wrap each cycle in the Rails reloader so constants (driver classes, models)
  # are available and correctly reloaded in development between iterations.
  Rails.application.reloader.wrap do
    output_writer = Logic::OutputWriter.new
    output_commands_by_device_id = output_writer.enabled_commands_by_device_id

    # Read every device on every host interface.
    HostInterface.includes(:devices).each do |iface|
      begin
        iface.modbus_client do |client|
          client.read_retry_timeout = 0.5
          client.read_retries = 2

          iface.devices.each do |device|
            state = begin
              slave = client.with_slave(device.modbus_address)
              driver = device.driver_instance(slave)
              data = driver.read
              output_errors = []

              output_commands_by_device_id.fetch(device.id, []).each do |command|
                begin
                  output_writer.write(driver, command)
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
            rescue => e
              Rails.logger.warn "Poller: error reading device #{device.id} (addr #{device.modbus_address}): #{e.message}"
              { polled_at: Time.now.utc.iso8601, status: "error", error: e.message, data: nil }
            end

            device.update_columns(current_state: state, last_polled_at: Time.now)
          end
        end
      rescue => e
        Rails.logger.error "Poller: failed to connect to #{iface.port}: #{e.message}"
      end
    end
  end

  elapsed = Time.now - cycle_start
  sleep_for = POLL_INTERVAL - elapsed
  sleep(sleep_for) if sleep_for > 0
end
