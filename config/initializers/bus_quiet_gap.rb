# rmodbus transmits a request the instant it's asked to: straight after the
# previous reply, and straight after a timeout when it retries. Modbus RTU wants
# at least 3.5 character times of silence between frames, and some slaves'
# firmware frames on silence with little margin. This holds every request back
# until the bus has been quiet for `quiet_gap`. See claude/bus-quiet-gap.md.
#
# The state lives on the port, not the slave: every slave from
# `client.with_slave` shares the client's port, and the bus is the port.
module CCutrer
  class SerialPort
    # Comfortably above both the 4 ms Modbus minimum at 9600 baud and the FTDI's
    # 16 ms latency timer.
    DEFAULT_QUIET_GAP = 0.05

    attr_writer :quiet_gap, :quiet_until

    def quiet_gap = @quiet_gap || DEFAULT_QUIET_GAP

    # Monotonic time before which nothing may be sent.
    def quiet_until = @quiet_until || 0.0

    # Seconds to put one character on the wire: start, data, parity, stop bits.
    def char_time = (1 + data_bits + (parity == :none ? 0 : 1) + stop_bits).fdiv(baud)
  end
end

module BusQuietGap
  def self.now = Process.clock_gettime(Process::CLOCK_MONOTONIC)

  private

  def send_pdu(pdu)
    return super unless @io.respond_to?(:quiet_until)

    wait = @io.quiet_until - BusQuietGap.now
    sleep(wait) if wait.positive?
    super
    # The write returns once the bytes are queued, not sent. A broadcast gets
    # no reply to wait for, so the transmit time has to be counted here.
    # uid + pdu + 2-byte CRC.
    @io.quiet_until = BusQuietGap.now + ((pdu.bytesize + 3) * @io.char_time) + @io.quiet_gap
  end

  # The ensure also runs when Timeout interrupts the read, so rmodbus's retry
  # waits out the gap rather than colliding with a late reply.
  def read_pdu
    super
  ensure
    @io.quiet_until = BusQuietGap.now + @io.quiet_gap if @io.respond_to?(:quiet_until)
  end
end

# Prepended, so it wraps the send_pdu in rmodbus_encoding_patch.rb whichever
# initializer loads first.
ModBus::RTUSlave.prepend(BusQuietGap)
