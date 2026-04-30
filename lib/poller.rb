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
    # Read every device on every host interface.
    HostInterface.includes(:devices).each do |iface|
      begin
        ModBus::RTUClient.connect(iface.port, iface.baud_rate,
          data_bits: iface.data_bits,
          stop_bits: iface.stop_bits,
          parity:    iface.parity.to_sym
        ) do |client|
          client.read_retry_timeout = 0.5
          client.read_retries = 2

          iface.devices.each do |device|
            state = begin
              slave = client.with_slave(device.modbus_address)
              data  = device.driver_instance(slave).read
              { polled_at: Time.now.utc.iso8601, status: "ok", error: nil, data: data }
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
