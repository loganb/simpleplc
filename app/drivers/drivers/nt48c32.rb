module Drivers
  # NT48C32 — 32-channel B3950-10K NTC temperature acquisition board
  #
  # Registers (FC 04, input registers):
  #   0x0000–0x001F (0–31)  : Channel 1–32 temperature, unit 0.1°C (signed)
  #   0x0020–0x003F (32–63) : Channel 1–32 resistance, unit 0.01 kΩ
  #
  # Special function registers (FC 03, holding registers):
  #   0x00F7 (247) : Product ID (2532 for NT48C32)
  #   0x00FD (253) : RS485 address
  #   0x00FE (254) : Baud rate code
  #   0x00FF (255) : Parity
  #
  class NT48C32 < Base
    PRODUCT_ID      = 2532
    CHANNEL_COUNT   = 32
    TEMP_REG_BASE   = 0x0000
    RESIST_REG_BASE = 0x0020

    # Value returned when no NTC probe is connected (-273.1°C = absolute zero sentinel)
    NO_PROBE_RAW = 0xF555  # -2731 as signed → -273.1°C

    def self.display_name  = "NT48C32 32-Ch NTC Temperature"
    def self.channel_count = CHANNEL_COUNT

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
