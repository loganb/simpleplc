module Drivers
  # Abstract base class for all RS-485 device drivers.
  #
  # Each driver is instantiated per-request with the Device record and
  # a live ModBus::RTUSlave. Drivers translate high-level operations into
  # Modbus register reads/writes and return structured data.
  #
  # Subclasses must implement:
  #   - read  → Hash of named readings
  #
  class Base
    attr_reader :device, :slave

    def initialize(device, slave)
      @device = device
      @slave  = slave
    end

    # Read current values from the device.
    # Returns a Hash of { channel_or_key => value }.
    def read
      raise NotImplementedError, "#{self.class}#read not implemented"
    end

    # Human-readable device type name.
    def self.display_name
      raise NotImplementedError
    end

    # Number of addressable channels on this device type.
    def self.channel_count
      raise NotImplementedError
    end
  end
end
