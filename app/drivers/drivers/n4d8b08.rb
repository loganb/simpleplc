module Drivers
  # N4D8B08 — 8-channel RS485 relay/digital I/O controller
  #
  # Output relay registers (FC 03 read; FC 06/16 write):
  #   0x0001–0x0008  Channel 1–8 output state
  #     Read value:  0x0000 = relay closed, 0x0001 = relay open
  #
  # Input registers (FC 03 read only):
  #   0x0081–0x0088  Channel 1–8 input state (NPN)
  #     0x0000 = input off, 0x0001 = input on
  #
  # Write command values (FC 06, written to the channel's output register):
  #   0x0001  Open relay
  #   0x0002  Close relay
  #   0x0003  Toggle (self-locking)
  #   0x0004  Latch (inter-locking)
  #   0x0005  Momentary (1 second)
  #   0x0006  Delay (delay time set separately, 0–255 seconds)
  #   0x0007  Open all  (write to register 0x0000)
  #   0x0008  Close all (write to register 0x0000)
  #
  # Special registers (FC 03/06):
  #   0x00FD  Input/output relationship: 0=unrelated, 1=self-locking (default),
  #                                      2=interlocking, 3=momentary
  #   0x00FE  Baud rate: 0=1200, 1=2400, 2=4800, 3=9600 (default), 4=19200, 5=factory reset
  #
  class N4D8B08 < Base
    CHANNEL_COUNT    = 8
    OUTPUT_REG_BASE  = 0x0001  # channels 1–8 at 0x0001–0x0008
    INPUT_REG_BASE   = 0x0081  # channels 1–8 at 0x0081–0x0088
    RELATIONSHIP_REG = 0x00FD

    # FC 06 command values
    CMD_OPEN         = 0x0001
    CMD_CLOSE        = 0x0002
    CMD_TOGGLE       = 0x0003
    CMD_LATCH        = 0x0004
    CMD_MOMENTARY    = 0x0005
    CMD_DELAY        = 0x0006
    CMD_OPEN_ALL     = 0x0007
    CMD_CLOSE_ALL    = 0x0008

    RELATIONSHIP_UNRELATED = 0x0000

    def self.display_name  = "N4D8B08 8-Ch RS485 Relay I/O"
    def self.channel_count = CHANNEL_COUNT

    def initialize(device, slave)
      super
      slave.holding_registers[RELATIONSHIP_REG] = RELATIONSHIP_UNRELATED
    end

    # Returns current state of all relay outputs and digital inputs.
    #
    # Result hash:
    #   {
    #     outputs: [true/false, …],  # true = relay open, false = relay closed
    #     inputs:  [true/false, …]   # true = input on, false = input off
    #   }
    #
    def read
      outputs = slave.holding_registers[OUTPUT_REG_BASE..(OUTPUT_REG_BASE + CHANNEL_COUNT - 1)].map { |v| v == 0x0001 }
      inputs  = slave.holding_registers[INPUT_REG_BASE..(INPUT_REG_BASE   + CHANNEL_COUNT - 1)].map { |v| v == 0x0001 }

      { outputs: outputs, inputs: inputs }
    end

    # Opens (energizes) a relay channel.
    # channel: 1-based (1–8)
    def open(channel)
      validate_channel!(channel)
      slave.holding_registers[channel] = CMD_OPEN
    end

    # Closes (de-energizes) a relay channel.
    # channel: 1-based (1–8)
    def close(channel)
      validate_channel!(channel)
      slave.holding_registers[channel] = CMD_CLOSE
    end

    # Toggles a relay channel.
    def toggle(channel)
      validate_channel!(channel)
      slave.holding_registers[channel] = CMD_TOGGLE
    end

    # Momentary pulse (1 second) on a channel.
    def momentary(channel)
      validate_channel!(channel)
      slave.holding_registers[channel] = CMD_MOMENTARY
    end

    # Timed delay open: relay opens then closes after delay_seconds (0–255).
    def delay_open(channel, delay_seconds)
      validate_channel!(channel)
      raise ArgumentError, "delay must be 0–255 seconds" unless (0..255).cover?(delay_seconds)
      # Delay time is encoded in the high byte of the 16-bit value
      slave.holding_registers[channel] = (CMD_DELAY) | (delay_seconds << 8)
    end

    # Opens all 8 relay channels.
    def open_all
      slave.holding_registers[0x0000] = CMD_OPEN_ALL
    end

    # Closes all 8 relay channels.
    def close_all
      slave.holding_registers[0x0000] = CMD_CLOSE_ALL
    end

    private

    def validate_channel!(channel)
      raise ArgumentError, "channel must be 1–#{CHANNEL_COUNT}" unless (1..CHANNEL_COUNT).cover?(channel)
    end
  end
end
