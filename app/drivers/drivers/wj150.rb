module Drivers
  # WJ150 — WAYJUN 2-channel high-speed pulse counter (Modbus RTU)
  #
  # Run as two independent DI counters ("working mode 1"). All registers are
  # holding registers (FC 03/06); addresses are the datasheet's 0-based "PC/DCS"
  # column. 32-bit values span two registers, **low word first**.
  #
  #   0        Working mode: 0 = AB encoder (factory), 1 = two counters (power cycle)
  #   32–35    Channel A0, B0 count, uint32 each
  #   81       DI pull-up: 0 off, 1 on (needed for NPN / dry-contact sensors)
  #   144–147  Channel A0, B0 frequency, float32 Hz each
  #   180–181  Channel A0, B0 filter time, ms (power cycle)
  #   200      Module address (power cycle)
  #   210      Product ID, read-only, 0x0150
  #
  # Settings that need a power cycle are written by #configure! and take effect
  # only once the operator power-cycles the module.
  class WJ150 < Base
    PRODUCT_ID     = 0x0150
    CHANNEL_COUNT  = 2
    CHANNELS       = %w[A B].freeze

    MODE_REG       = 0
    COUNT_REG_BASE = 32
    PULL_UP_REG    = 81
    FREQ_REG_BASE  = 144
    FILTER_REG_BASE = 180
    ADDRESS_REG    = 200
    PRODUCT_REG    = 210

    COUNTER_MODE   = 1

    def self.device_support(probe)
      result = probe.read(:holding_registers, PRODUCT_REG)
      return probe.verdict("yes", "Product ID 0x0150 identifies WJ150") if result[:status] == "ok" && result[:values] == PRODUCT_ID
      return probe.verdict("no", "Different product ID: #{result[:values]}") if result[:status] == "ok"
      return probe.verdict("no", "Product ID register is unsupported") if result[:status] == "unsupported"
      probe.verdict("maybe", "Product ID could not be established")
    end

    def self.display_name  = "WJ150 2-Ch Pulse Counter"
    def self.channel_count = CHANNEL_COUNT
    def self.configuration_effects
      "Sets the module to two-counter mode and writes any managed settings that differ. Mode, filter and address changes take effect after the module is power-cycled."
    end

    def self.inputs
      counts = CHANNELS.each_with_index.map do |name, index|
        { path: "counts[#{index}]", label: "Channel #{name} count", value_type: "number", units: "pulses" }
      end
      frequencies = CHANNELS.each_with_index.map do |name, index|
        { path: "frequencies[#{index}]", label: "Channel #{name} frequency", value_type: "number", units: "Hz" }
      end
      counts + frequencies
    end

    def self.settings_schema
      [ address_setting(requires_power_cycle: true,
          help: "Programs the module to this address. Once power-cycled it is found there and the device address updates."),
        { key: "pull_up", label: "Input pull-up", type: "boolean", requires_power_cycle: false,
          help: "On for NPN, dry-contact and reed-switch sensors." },
        { key: "filter_a_ms", label: "Channel A filter (ms)", type: "integer", min: 0, max: 65_535, requires_power_cycle: true,
          help: "0 for electronic sensors; 20–100 for reed switches and mechanical contacts." },
        { key: "filter_b_ms", label: "Channel B filter (ms)", type: "integer", min: 0, max: 65_535, requires_power_cycle: true,
          help: "0 for electronic sensors; 20–100 for reed switches and mechanical contacts." } ]
    end

    # Writes only registers that differ from the desired state, to spare the
    # module's EEPROM; settings the operator has not set are left alone.
    def configure!
      write_if_changed(MODE_REG, COUNTER_MODE)
      write_if_changed(PULL_UP_REG, settings["pull_up"] ? 1 : 0) if settings.key?("pull_up")
      write_if_changed(FILTER_REG_BASE, settings["filter_a_ms"]) if settings.key?("filter_a_ms")
      write_if_changed(FILTER_REG_BASE + 1, settings["filter_b_ms"]) if settings.key?("filter_b_ms")
      write_if_changed(ADDRESS_REG, settings["address"]) if settings.key?("address")
    end

    # Result hash:
    #   {
    #     counts:      [Integer, Integer],  # pulses since last clear; wraps at 2**32
    #     frequencies: [Float, Float]       # Hz
    #   }
    #
    # Raises when the module is not in two-counter mode, since the count
    # registers are meaningless then.
    def read
      mode = slave.holding_registers[MODE_REG]
      raise "WJ150 is in encoder mode (#{mode}); power-cycle it to apply two-counter mode" unless mode == COUNTER_MODE

      counts = words32(slave.holding_registers[COUNT_REG_BASE..(COUNT_REG_BASE + 3)])
      frequencies = words32(slave.holding_registers[FREQ_REG_BASE..(FREQ_REG_BASE + 3)]).map do |bits|
        [ bits ].pack("N").unpack1("g")
      end

      { counts: counts, frequencies: frequencies }
    end

    # After an address change and power cycle the module answers at the
    # address in settings, and says so with its product ID.
    def address_confirmed?(slave) = slave.holding_registers[PRODUCT_REG] == PRODUCT_ID

    private

    def write_if_changed(register, value)
      slave.holding_registers[register] = value unless slave.holding_registers[register] == value
    end

    # [lo, hi, lo, hi, …] → [uint32, …]
    def words32(registers)
      registers.each_slice(2).map { |lo, hi| (hi << 16) | lo }
    end
  end
end
