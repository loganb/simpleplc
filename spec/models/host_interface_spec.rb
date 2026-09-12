require "rails_helper"

RSpec.describe HostInterface, type: :model do
  it "requires a name so the UI has something readable to show for a by-id port" do
    interface = described_class.new(
      name: "",
      port: "/dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0",
      baud_rate: 9600
    )

    expect(interface).not_to be_valid
    expect(interface.errors[:name]).to be_present
  end

  describe "#port_present? / #resolved_device" do
    it "resolves a port that exists to its device node" do
      Tempfile.create("tty") do |file|
        interface = described_class.new(name: "Bus A", port: file.path)

        expect(interface).to be_port_present
        expect(interface.resolved_device).to eq(File.realpath(file.path))
      end
    end

    it "reports a port that does not exist as missing rather than raising" do
      interface = described_class.new(name: "Unplugged", port: "/dev/ttyUSB-nope")

      expect(interface).not_to be_port_present
      expect(interface.resolved_device).to be_nil
    end

    it "reports a nil port as missing" do
      expect(described_class.new(name: "Blank", port: nil)).not_to be_port_present
    end

    it "leaves Object#present? alone" do
      # port_present? is deliberately not present?; a record with a missing port
      # is still a perfectly non-blank object.
      expect(described_class.new(name: "Unplugged", port: "/dev/ttyUSB-nope")).to be_present
    end
  end

  it "opens an RTU client with the interface serial settings" do
    interface = described_class.new(
      name: "Bus A",
      port: "/dev/ttyUSB0",
      baud_rate: 19_200,
      data_bits: 7,
      stop_bits: 2,
      parity: "even"
    )
    yielded_client = Object.new
    block_client = nil

    expect(ModBus::RTUClient).to receive(:connect).with(
      "/dev/ttyUSB0",
      19_200,
      data_bits: 7,
      stop_bits: 2,
      parity: :even
    ).and_yield(yielded_client)

    interface.modbus_client do |client|
      block_client = client
    end

    expect(block_client).to eq(yielded_client)
  end
end
