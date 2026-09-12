require "rails_helper"
require "tmpdir"

# FakeRtuClient and FakePollerDriver live in spec/support/fake_modbus.rb.
RSpec.describe Poller do
  subject(:poller) { described_class.new }

  # A real path on disk, so HostInterface#port_present? answers honestly rather
  # than being stubbed out.
  around do |example|
    Dir.mktmpdir do |dir|
      @port_path = File.join(dir, "ttyUSB0")
      FileUtils.touch(@port_path)
      example.run
    end
  end

  attr_reader :port_path

  let(:clients) { [] }
  let!(:interface) { HostInterface.create!(name: "Relay Bus", port: port_path) }
  let!(:device) do
    Device.create!(name: "Relay board", host_interface: interface, driver: "FakePollerDriver", modbus_address: 3)
  end

  before do
    FakePollerDriver.reset!
    allow(ModBus::RTUClient).to receive(:connect) do
      FakeRtuClient.new.tap { |client| clients << client }
    end
  end

  describe "holding the port open" do
    it "opens the port once and reuses it across cycles" do
      2.times { poller.run_cycle }

      expect(ModBus::RTUClient).to have_received(:connect).once
      expect(clients.sole).not_to be_closed
      expect(FakePollerDriver.reads).to eq(2)
    end

    it "reuses driver instances, so a driver's setup writes happen once per connection" do
      # Drivers::N4D8B08#initialize writes the relationship register; rebuilding
      # a driver every cycle would mean a bus write every 10 seconds forever.
      2.times { poller.run_cycle }

      expect(FakePollerDriver.instantiations).to eq(1)
    end

    it "reports the bus online with a heartbeat" do
      poller.run_cycle

      expect(interface.reload).to have_attributes(online: true, connection_error: nil)
      expect(interface.poller_reported_at).to be_within(5.seconds).of(Time.current)
      expect(interface.connection_state).to eq("online")
    end

    it "reconnects when the serial settings change" do
      poller.run_cycle
      interface.update!(baud_rate: 19_200)
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).twice
      expect(clients.first).to be_closed
      expect(clients.last).not_to be_closed
    end

    it "does not reconnect when an unrelated field changes" do
      poller.run_cycle
      interface.update!(name: "Renamed Bus")
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).once
    end
  end

  describe "disabling a bus" do
    it "releases the port and reports offline once the port is actually closed" do
      poller.run_cycle
      interface.update!(enabled: false)
      poller.run_cycle

      expect(clients.sole).to be_closed
      expect(interface.reload).to have_attributes(online: false, connection_error: nil)
      expect(interface.connection_state).to eq("disabled")
    end

    it "reads as releasing until the poller confirms, then disabled" do
      # The handshake anything waiting for the bus depends on: "disabled" is
      # only reached once the port is genuinely free.
      poller.run_cycle
      interface.update!(enabled: false)
      expect(interface.reload.connection_state).to eq("releasing")

      poller.run_cycle

      expect(interface.reload.connection_state).to eq("disabled")
    end

    it "stops polling the devices on that bus" do
      poller.run_cycle
      interface.update!(enabled: false)
      poller.run_cycle

      expect(FakePollerDriver.reads).to eq(1)
    end

    it "never opens the port for a bus that starts out disabled" do
      interface.update!(enabled: false)
      poller.run_cycle

      expect(ModBus::RTUClient).not_to have_received(:connect)
      expect(interface.reload.online).to be(false)
    end

    it "reopens the port when the bus is enabled again" do
      poller.run_cycle
      interface.update!(enabled: false)
      poller.run_cycle
      interface.update!(enabled: true)
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).twice
      expect(clients.last).not_to be_closed
      expect(interface.reload.connection_state).to eq("online")
    end
  end

  describe "error handling" do
    it "keeps the port open when a device reports a Modbus error" do
      # A timeout or CRC mismatch means one device is unhappy, not that the bus
      # is dead — dropping the port here would punish every other device on it.
      FakePollerDriver.read_behaviour = -> { raise ModBus::Errors::ModBusTimeout, "timed out" }

      poller.run_cycle

      expect(clients.sole).not_to be_closed
      expect(interface.reload).to have_attributes(online: true, connection_error: nil)
      expect(device.reload.current_state).to include("status" => "error", "error" => "timed out")
    end

    it "drops the connection when the port itself fails" do
      FakePollerDriver.read_behaviour = -> { raise Errno::EIO }

      poller.run_cycle

      expect(clients.sole).to be_closed
      expect(interface.reload).to have_attributes(online: false)
      expect(interface.connection_error).to include("Errno::EIO")
      expect(interface.connection_state).to eq("offline")
    end

    it "reopens a dropped connection on the next cycle" do
      FakePollerDriver.read_behaviour = -> { raise Errno::EIO }
      poller.run_cycle

      FakePollerDriver.read_behaviour = -> { { ok: true } }
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).twice
      expect(interface.reload.connection_state).to eq("online")
    end

    it "does not try to open a port that is not present on the host" do
      interface.update!(port: "/dev/ttyUSB-nope")

      poller.run_cycle

      expect(ModBus::RTUClient).not_to have_received(:connect)
      expect(interface.reload.connection_error).to eq("port /dev/ttyUSB-nope is not present on this host")
      expect(interface.connection_state).to eq("offline")
    end

    it "records why the port could not be opened" do
      allow(ModBus::RTUClient).to receive(:connect).and_raise(Errno::EACCES)

      poller.run_cycle

      expect(interface.reload).to have_attributes(online: false)
      expect(interface.connection_error).to include("Errno::EACCES")
    end
  end

  describe "releasing ports" do
    it "closes the port of an interface deleted between cycles" do
      poller.run_cycle
      interface.destroy!
      poller.run_cycle

      expect(clients.sole).to be_closed
    end

    it "releases every port and marks buses offline on shutdown" do
      # systemd sends SIGTERM on restart; without this the database keeps saying
      # a dead process is holding the bus until the staleness window expires.
      poller.run_cycle
      poller.shut_down

      expect(clients.sole).to be_closed
      expect(interface.reload).to have_attributes(online: false)
    end

    it "is a no-op when nothing is held" do
      expect { poller.shut_down }.not_to raise_error
    end
  end
end
