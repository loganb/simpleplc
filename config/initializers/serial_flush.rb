# ccutrer-serialport has no way to discard queued bytes, and rmodbus relies on
# one: RTUSlave#clean_input_buff calls `flush_input` when the port class defines
# it, and otherwise falls back to IO#flush, which only flushes Ruby's *output*
# buffer. Without this, stale bytes on the line (a 0x00 flood from a bus fault,
# a late reply) are read as the start of the next response and surface as
# "Illegal function: 0". See claude/serial-flush.md.
module CCutrer
  class SerialPort
    # tcflush(3) queue selectors. Hard-coded rather than generated: they are
    # fixed per OS, and a wrong one is dangerous (TCOFLUSH would discard output
    # where input was meant), so anything unrecognised refuses to load.
    TCIFLUSH, TCOFLUSH, TCIOFLUSH =
      case RUBY_PLATFORM
      when /linux/ then [ 0, 1, 2 ]
      when /darwin/ then [ 1, 2, 3 ]
      else raise "serial_flush: unknown tcflush constants for #{RUBY_PLATFORM}"
      end

    module Termios
      attach_function :tcflush, [ :int, :int ], :int, blocking: true
    end

    # Discards bytes received but not yet read. Also what rmodbus calls before
    # every request.
    def flush_input = tcflush(TCIFLUSH)

    # Discards bytes written but not yet transmitted, so a request stuck behind
    # a stalled adapter isn't sent after the bus recovers.
    def flush_output = tcflush(TCOFLUSH)

    def flush_io = tcflush(TCIOFLUSH)

    private

    def tcflush(queue)
      err = Termios.tcflush(fileno, queue)
      raise SystemCallError, FFI.errno if err == -1

      self
    end
  end
end

module ModBus
  class Client
    # Discards anything queued on the line in either direction. rmodbus keeps
    # its IO private, so this is how callers outside the library reset the bus.
    # A no-op for transports that can't flush (TCP).
    def flush_line
      @io.flush_io if @io.respond_to?(:flush_io)
    end
  end
end
