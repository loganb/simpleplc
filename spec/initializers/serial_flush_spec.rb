require "rails_helper"
require "pty"

# A real tty: the point is that tcflush(3) is called with the right selector for
# this OS, which a fake can't tell us.
RSpec.describe CCutrer::SerialPort do
  around do |example|
    PTY.open do |master, slave|
      @master = master
      @port = described_class.new(slave.path, baud: 9600)
      begin
        example.run
      ensure
        @port.close
      end
    end
  end

  attr_reader :master, :port

  def readable?(timeout: 0.2) = !port.wait_readable(timeout).nil?

  describe "#flush_input" do
    it "discards bytes received but not yet read" do
      master.write("\x00\x00\x00\x00")
      expect(readable?).to be(true)

      port.flush_input

      expect(readable?(timeout: 0.1)).to be(false)
    end

    it "is the hook rmodbus calls instead of falling back to IO#flush" do
      expect(described_class).to be_public_method_defined(:flush_input)
    end

    it "keeps bytes that arrive afterwards" do
      master.write("\x00")
      port.flush_input
      master.write("ok")

      expect(readable?).to be(true)
    end
  end

  describe "#flush_io" do
    it "discards received bytes" do
      master.write("\x00\x00")
      expect(readable?).to be(true)

      port.flush_io

      expect(readable?(timeout: 0.1)).to be(false)
    end
  end

  it "raises when the port is closed" do
    port.close
    expect { port.flush_input }.to raise_error(IOError)
  end

  describe "ModBus::Client#flush_line" do
    it "flushes a serial port and ignores transports that can't flush" do
      client = ModBus::RTUClient.allocate
      client.instance_variable_set(:@io, port)
      master.write("\x00\x00")
      client.flush_line
      expect(readable?(timeout: 0.1)).to be(false)

      client.instance_variable_set(:@io, StringIO.new)
      expect { client.flush_line }.not_to raise_error
    end
  end
end
