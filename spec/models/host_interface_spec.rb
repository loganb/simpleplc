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

  describe "#connection_state" do
    def interface(**attrs)
      described_class.new({ name: "Bus A", port: "/dev/ttyUSB0" }.merge(attrs))
    end

    it "is releasing while the poller still holds a port the operator turned off" do
      # Disabling is a request; until the poller confirms, the bus is not free.
      expect(interface(enabled: false, online: true, poller_reported_at: Time.current).connection_state)
        .to eq("releasing")
    end

    it "is disabled once the poller has let the port go" do
      expect(interface(enabled: false, online: false, poller_reported_at: Time.current).connection_state)
        .to eq("disabled")
    end

    it "is disabled, not releasing, when the poller stopped reporting mid-release" do
      # A dead process holds nothing — the kernel closed its ports with it.
      iface = interface(enabled: false, online: true, poller_reported_at: Time.current)

      travel_to((HostInterface::STALE_AFTER + 1.second).from_now) do
        expect(iface.connection_state).to eq("disabled")
      end
    end

    it "is online when the poller reported holding the port open just now" do
      expect(interface(enabled: true, online: true, poller_reported_at: Time.current).connection_state)
        .to eq("online")
    end

    it "is offline when the poller is reporting and is not holding the port" do
      expect(interface(enabled: true, online: false, poller_reported_at: Time.current).connection_state)
        .to eq("offline")
    end

    it "is unknown when a poller died holding the port, rather than staying online forever" do
      iface = interface(enabled: true, online: true, poller_reported_at: Time.current)

      travel_to((HostInterface::STALE_AFTER + 1.second).from_now) do
        expect(iface.connection_state).to eq("unknown")
      end
    end

    it "is unknown before any poller has ever reported" do
      expect(interface(enabled: true, online: true, poller_reported_at: nil).connection_state)
        .to eq("unknown")
    end

    it "is unknown for a freshly configured bus, not offline" do
      # "offline" is a statement about what the poller decided. A bus no poller
      # has ever seen — including because the poller isn't running — hasn't been
      # decided about at all.
      expect(interface(enabled: true, online: false, poller_reported_at: nil).connection_state)
        .to eq("unknown")
    end

    it "believes the poller for longer than it could plausibly take to report" do
      # Guards the two constants against drifting apart: if the poll interval
      # ever grows past the staleness window, every healthy bus reads as
      # unknown between cycles.
      expect(HostInterface::STALE_AFTER).to be > Poller::POLL_INTERVAL.seconds * 2
    end
  end

  describe "#report_connection" do
    it "records the poller's observation without touching updated_at" do
      iface = described_class.create!(name: "Bus A", port: "/dev/ttyUSB0")
      before = iface.updated_at

      travel_to(1.minute.from_now) do
        iface.report_connection(online: true)
      end

      expect(iface.reload).to have_attributes(online: true, connection_error: nil, updated_at: before)
      expect(iface.poller_reported_at).to be_present
    end

    it "records why the port could not be opened" do
      iface = described_class.create!(name: "Bus A", port: "/dev/ttyUSB0")
      iface.report_connection(online: false, error: "Errno::ENOENT: No such file or directory")

      expect(iface.reload).to have_attributes(
        online: false,
        connection_error: "Errno::ENOENT: No such file or directory"
      )
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
