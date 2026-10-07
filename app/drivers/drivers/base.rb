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

    # Desired settings the operator has chosen; absent keys are unmanaged.
    def settings = device.settings || {}

    # Explicit normal-operation setup. Constructors and discovery never write.
    def configure!; end

    def self.device_support(probe)
      probe.verdict("maybe", "No compatibility check implemented")
    end

    # Where the module wants to live when the operator has asked to reprogram
    # its address. Called by the poller after a failed read: return the new
    # address once the module answers there, else nil. The poller then commits
    # it to the device. `client` is the open bus client.
    def relocated_address(client) = nil

    # Read current values from the device.
    # Returns a Hash of { channel_or_key => value }.
    def read
      raise NotImplementedError, "#{self.class}#read not implemented"
    end

    # Human-readable device type name.
    def self.display_name
      raise NotImplementedError
    end

    # Operator-tunable settings stored in Device#settings, each
    # { key:, label:, type: "boolean"|"integer", min:, max:, requires_power_cycle:, help: }.
    # A key absent from Device#settings is unmanaged: the driver leaves it alone.
    def self.settings_schema = []

    # What starting normal polling does to the device, shown beside the driver choice.
    def self.configuration_effects = "None"

    # Validates and normalises raw settings against settings_schema.
    # Raises ArgumentError describing the first problem.
    def self.normalize_settings(raw)
      raise ArgumentError, "settings must be an object" unless raw.is_a?(Hash)
      schema = settings_schema.index_by { |s| s[:key] }
      raw.stringify_keys.each_with_object({}) do |(key, value), result|
        entry = schema[key] or raise ArgumentError, "unknown setting #{key}"
        case entry[:type]
        when "boolean"
          raise ArgumentError, "#{entry[:label]} must be true or false" unless [ true, false ].include?(value)
        when "integer"
          raise ArgumentError, "#{entry[:label]} must be a whole number" unless value.is_a?(Integer)
          raise ArgumentError, "#{entry[:label]} must be between #{entry[:min]} and #{entry[:max]}" unless (entry[:min]..entry[:max]).cover?(value)
        end
        result[key] = value
      end
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
