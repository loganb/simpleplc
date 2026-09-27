class Poller
  # An open serial port, held across poll cycles.
  #
  # Opening an RS-485 adapter is slow — the USB serial driver has to attach and
  # the line has to settle — so the poller pays that cost once and keeps the
  # client. That makes the poller stateful, and this class is where that state
  # lives. See claude/interface-online-state.md.
  class Connection
    attr_reader :client, :settings

    # Serial settings captured at open time. If an operator edits any of these,
    # the fingerprint stops matching and the poller reconnects. Deliberately not
    # updated_at, which also changes for edits that don't affect the wire
    # (renaming the bus, toggling `enabled`).
    def self.settings_for(interface)
      interface.slice(:port, :baud_rate, :data_bits, :stop_bits, :parity)
    end

    # Opens the port. Raises whatever the serial library raises; the caller
    # decides what a failure to open means for the interface's state.
    def self.open(interface, read_retry_timeout:, read_retries:)
      bus_lock = SerialBusLock.acquire(interface.port)
      interface.with_lock do
        raise HardwareError, "Interface disabled or scanning" unless interface.enabled? && !interface.scan_active?
        interface.identify_port
        interface.save! if interface.changed?
      end
      client = interface.modbus_client
      client.read_retry_timeout = read_retry_timeout
      client.read_retries = read_retries

      new(client, settings_for(interface), bus_lock: bus_lock)
    rescue Exception
      client&.close
      bus_lock&.close
      interface.reload if interface.persisted?
      raise
    end

    def initialize(client, settings, bus_lock: nil)
      @bus_lock = bus_lock
      @client   = client
      @settings = settings
      @drivers  = {}
    end

    # True when this connection can still serve the given interface: the port is
    # open and the serial settings it was opened with still match the record.
    def usable_for?(interface)
      !client.closed? && settings == self.class.settings_for(interface)
    end

    # Drivers are cached per device, because explicitly configuring one can transact on
    # the bus — Drivers::N4D8B08#configure! writes the input/output relationship
    # register. Rebuilding them every cycle means a setup write to every relay
    # board every 10 seconds; cached here, it happens once when the bus comes
    # online, which is also when a power-cycled board needs it.
    def driver_for(device)
      fingerprint = [ device.driver, device.modbus_address ]
      cached = @drivers[device.id]
      return cached.last if cached && cached.first == fingerprint

      driver = device.driver_instance(client.with_slave(device.modbus_address))
      driver.configure!
      @drivers[device.id] = [ fingerprint, driver ]
      driver
    end

    # Drops cached drivers for devices no longer on this interface, so a long
    # running poller doesn't hold driver instances for deleted rows.
    def retain_drivers_for(device_ids)
      @drivers.keep_if { |device_id, _| device_ids.include?(device_id) }
    end

    def close
      client.close
    rescue SystemCallError, IOError => e
      # The port is already gone — that's the state we were trying to reach.
      Rails.logger.debug { "Poller: error closing port: #{e.message}" }
    ensure
      @bus_lock&.close
    end
  end
end
