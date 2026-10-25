require "rails_helper"
require "pty"

module BusQuietGapSpec
  # Answers FC 03 reads with `count` zero registers, recording when each request
  # arrived and when each reply was written. Requests whose index is in
  # `ignore` get no reply, as from a device that has hung.
  class Responder
    attr_reader :received_at, :replied_at

    def initialize(master, ignore: [])
      @master = master
      @ignore = ignore
      @received_at = []
      @replied_at = []
      @thread = Thread.new { serve }
    end

    def stop = @thread.kill.join

    private

    def serve
      loop do
        request = @master.read(8)
        @received_at << Process.clock_gettime(Process::CLOCK_MONOTONIC)
        next if @ignore.include?(@received_at.size - 1)

        uid, _func, _addr, count = request.unpack("CCnn")
        reply = [ uid, 3, count * 2 ].pack("CCC") + ("\x00\x00" * count)
        reply << [ Digest::CRC16Modbus.checksum(reply) ].pack("S<")
        @master.write(reply.b)
        @master.flush
        @replied_at << Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end
  end
end

# A real tty with a responder thread on the far end standing in for a slave, so
# the timings are measured where a device would see them.
RSpec.describe "Bus quiet gap" do
  let(:gap) { 0.05 }
  # Scheduling slop between the responder thread's clock reads and the bus.
  let(:slop) { 0.003 }

  def now = Process.clock_gettime(Process::CLOCK_MONOTONIC)

  around do |example|
    PTY.open do |master, slave|
      master.raw!
      @master = master
      @slave_path = slave.path
      example.run
    ensure
      @responder&.stop
      @port&.close
    end
  end

  def open_port
    @port = CCutrer::SerialPort.new(@slave_path, baud: 9600)
    @port.quiet_gap = gap
    @port
  end

  def respond(**options) = @responder = BusQuietGapSpec::Responder.new(@master, **options)

  def slave_on(io, uid: 1, timeout: 0.5, retries: 1)
    ModBus::RTUSlave.new(uid, io).tap do |slave|
      slave.read_retry_timeout = timeout
      slave.read_retries = retries
    end
  end

  describe "CCutrer::SerialPort" do
    it "defaults to DEFAULT_QUIET_GAP and a bus that is already quiet" do
      port = CCutrer::SerialPort.new(@slave_path, baud: 9600)
      @port = port

      expect(port.quiet_gap).to eq(CCutrer::SerialPort::DEFAULT_QUIET_GAP)
      expect(port.quiet_until).to eq(0.0)
    end

    it "times a character from the framing: start, data, parity and stop bits" do
      @port = CCutrer::SerialPort.new(@slave_path, baud: 9600)
      expect(@port.char_time).to be_within(1e-9).of(10.0 / 9600)

      # A pty refuses parity and 2 stop bits, so stub the framing it reports.
      allow(@port).to receive_messages(parity: :even, stop_bits: 2)
      expect(@port.char_time).to be_within(1e-9).of(12.0 / 9600)
    end
  end

  it "leaves the gap between a reply and the next request" do
    respond
    slave = slave_on(open_port)

    slave.holding_registers[0..7]
    slave.holding_registers[0x81..0x88]

    expect(@responder.received_at[1] - @responder.replied_at[0]).to be >= gap - slop
  end

  it "leaves the gap after a timed-out read before resending" do
    respond(ignore: [ 0 ])
    slave = slave_on(open_port, timeout: 0.1, retries: 2)

    expect(slave.holding_registers[0..7]).to eq([ 0 ] * 8)
    expect(@responder.received_at[1] - @responder.received_at[0]).to be >= 0.1 + gap - slop
  end

  it "counts transmit time as well as the gap after a broadcast, which gets no reply" do
    port = open_port
    slave = slave_on(port, uid: 0)

    slave.holding_registers[1] = 0x0100
    sent = now

    # 8 bytes of 10 bits each at 9600 baud.
    expect(port.quiet_until - sent).to be_within(slop).of((8 * 10.0 / 9600) + gap)
  end

  it "applies the gap to every slave sharing the port" do
    respond
    port = open_port

    slave_on(port, uid: 1).holding_registers[0..7]
    slave_on(port, uid: 2).holding_registers[0..7]

    expect(@responder.received_at[1] - @responder.replied_at[0]).to be >= gap - slop
  end

  it "leaves an IO that doesn't track the bus alone" do
    respond
    io = File.open(@slave_path, "r+b")
    io.raw!
    slave = slave_on(io)

    started = now
    slave.holding_registers[0..7]
    slave.holding_registers[0..7]

    expect(now - started).to be < gap
  ensure
    io&.close
  end
end
