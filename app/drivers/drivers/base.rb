module Drivers
  # Abstract base class for all RS-485 device drivers.
  #
  # Each driver is cached per connection with the Device record and
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

    # Explicit normal-operation setup. Constructors and discovery never write.
    def configure!; end

    def self.device_support(probe)
      probe.verdict("maybe", "No compatibility check implemented")
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

    # Stable hardware capabilities. Inputs are readable values and outputs are
    # writable channels; logic-diagram concepts do not belong in this layer.
    def self.inputs = []
    def self.outputs = []
  end
end
