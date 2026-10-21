module Drivers
  # NT48C32 — 32-channel B3950-10K NTC temperature acquisition board
  #
  # Registers (FC 04, input registers):
  #   0x0000–0x001F (0–31)  : Channel 1–32 temperature, unit 0.1°C (signed)
  #   0x0020–0x003F (32–63) : Channel 1–32 resistance, unit 0.01 kΩ
  #
  # Special function registers (FC 03, holding registers):
  #   0x00F7 (247) : Product ID (2532 or 2632 listed for NT48C32)
  #   0x00FD (253) : RS485 address
  #   0x00FE (254) : Baud rate code
  #   0x00FF (255) : Parity
  #
  class NT48C32 < Base
    PRODUCT_ID      = 2632
    DOCUMENTED_PRODUCT_IDS = [ 2532, PRODUCT_ID ].freeze
    CHANNEL_COUNT   = 32
    TEMP_REG_BASE   = 0x0000
    RESIST_REG_BASE = 0x0020
    TEMPERATURE_BANK = (TEMP_REG_BASE..(TEMP_REG_BASE + CHANNEL_COUNT - 1)).freeze
    RESISTANCE_BANK = (RESIST_REG_BASE..(RESIST_REG_BASE + CHANNEL_COUNT - 1)).freeze
    LEGACY_PRODUCT_ID = 2608
    # Broad physical bounds for NTC readings; raw values are tenths of a °C.
    MIN_TEMPERATURE_RAW = -1000
    MAX_TEMPERATURE_RAW = 2000

    # Value returned when no NTC probe is connected (-273.1°C = absolute zero sentinel)
    NO_PROBE_RAW = 0xF555  # -2731 as signed → -273.1°C

    def self.device_support(probe)
      product = probe.read(:holding_registers, 247)
      return probe.verdict("maybe", "Product ID could not be established") unless product[:status] == "ok"
      return probe.verdict("yes", "Product ID #{product[:values]} is listed for NT48C32") if DOCUMENTED_PRODUCT_IDS.include?(product[:values])
      return probe.verdict("no", "Different product ID: #{product[:values]}") unless product[:values] == LEGACY_PRODUCT_ID

      temperatures = probe.read(:input_registers, TEMPERATURE_BANK)
      return probe.verdict("no", "Product ID 2608; NT48C32 temperature bank is unsupported") if temperatures[:status] == "unsupported"
      return probe.verdict("maybe", "Product ID 2608; 32-channel register banks could not be confirmed") unless temperatures[:status] == "ok"

      resistances = probe.read(:input_registers, RESISTANCE_BANK)
      return probe.verdict("no", "Product ID 2608; NT48C32 resistance bank is unsupported") if resistances[:status] == "unsupported"
      return probe.verdict("maybe", "Product ID 2608; 32-channel register banks could not be confirmed") unless resistances[:status] == "ok"

      unless ntc_temperature_bank?(temperatures[:values]) && resistance_bank?(resistances[:values])
        return probe.verdict("no", "Product ID 2608; 32-channel NTC register fingerprint did not match")
      end

      if live_channel_above_20?(temperatures[:values], resistances[:values])
        probe.verdict("yes", "NT48C32 32-channel NTC banks respond, including a live channel above 20; product register reports 2608")
      else
        probe.verdict("maybe", "Product ID 2608; NTC banks respond but no live channel above 20 confirms the 32-channel model")
      end
    end

    def self.ntc_temperature_bank?(values)
      values.is_a?(Array) && values.size == CHANNEL_COUNT && values.all? do |raw|
        next true if raw == NO_PROBE_RAW
        signed = raw >= 0x8000 ? raw - 0x10000 : raw
        (MIN_TEMPERATURE_RAW..MAX_TEMPERATURE_RAW).cover?(signed)
      end
    end
    private_class_method :ntc_temperature_bank?

    def self.resistance_bank?(values)
      values.is_a?(Array) && values.size == CHANNEL_COUNT && values.any?(&:positive?)
    end
    private_class_method :resistance_bank?

    def self.live_channel_above_20?(temperatures, resistances)
      (20...CHANNEL_COUNT).any? do |index|
        raw = temperatures[index]
        next false if raw == NO_PROBE_RAW
        signed = raw >= 0x8000 ? raw - 0x10000 : raw
        (MIN_TEMPERATURE_RAW..MAX_TEMPERATURE_RAW).cover?(signed) && resistances[index].positive?
      end
    end
    private_class_method :live_channel_above_20?

    def self.display_name  = "NT48C32 32-Ch NTC Temperature"
    def self.channel_count = CHANNEL_COUNT
    def self.inputs
      CHANNEL_COUNT.times.map do |index|
        { path: "temperatures[#{index}]", label: "Temperature #{index + 1}", value_type: "number", units: "°C" }
      end
    end

    # Returns temperature readings for all 32 channels.
    #
    # Result hash:
    #   {
    #     temperatures: [Float or nil, …]  # °C, nil if no probe
    #   }
    #
    def read
      raw = slave.input_registers[TEMP_REG_BASE..(TEMP_REG_BASE + CHANNEL_COUNT - 1)]

      temperatures = raw.map do |val|
        next nil if val == NO_PROBE_RAW
        signed = val >= 0x8000 ? val - 0x10000 : val
        signed / 10.0
      end

      { temperatures: temperatures }
    end

    # Returns resistance readings for all 32 channels.
    #
    # Result hash:
    #   {
    #     resistances: [Float or nil, …]  # kΩ, nil if no probe
    #   }
    #
    def read_resistance
      raw = slave.input_registers[RESIST_REG_BASE..(RESIST_REG_BASE + CHANNEL_COUNT - 1)]

      resistances = raw.map do |val|
        next nil if val == 0xFFFF
        val / 100.0
      end

      { resistances: resistances }
    end
  end
end
