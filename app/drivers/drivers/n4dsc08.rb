module Drivers
  # N4DSC08 — 8-channel RS485 DS18B20 temperature adapter board
  #
  # Registers (FC 04, input registers):
  #   0x0000–0x0007 (0–7) : Channel 1–8 temperature, unit 0.1°C (signed)
  #
  # Also mapped to holding registers (FC 03):
  #   0x00A0–0x00A7 (160–167) : Same temperature values
  #
  # Fault value: 0x8000 (32768) — sensor anomaly / no probe connected
  #
  # Special function registers (FC 03, holding registers):
  #   0x00FD (253) : RS485 address
  #   0x00FE (254) : Baud rate code
  #   0x00FF (255) : Parity
  #
  class N4DSC08 < Base
    CHANNEL_COUNT  = 8
    TEMP_REG_BASE  = 0x0000
    SENSOR_FAULT   = 0x8000

    def self.display_name  = "N4DSC08 8-Ch DS18B20 Temperature"
    def self.channel_count = CHANNEL_COUNT

    # Returns temperature readings for all 8 channels.
    #
    # Result hash:
    #   {
    #     temperatures: [Float or nil, …]  # °C, nil if no probe
    #   }
    #
    def read
      raw = slave.input_registers[TEMP_REG_BASE..(TEMP_REG_BASE + CHANNEL_COUNT - 1)]

      temperatures = raw.map do |val|
        signed = val >= 0x8000 ? val - 0x10000 : val
        next nil if signed == -32768  # sensor fault / no probe
        signed / 10.0
      end

      { temperatures: temperatures }
    end
  end
end
