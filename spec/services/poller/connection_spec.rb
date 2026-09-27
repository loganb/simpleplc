require "rails_helper"

RSpec.describe Poller::Connection do
  let(:client) { FakeRtuClient.new }
  let(:interface) { HostInterface.create!(name: "Relay Bus", port: "/dev/ttyUSB0") }
  let(:connection) { described_class.new(client, described_class.settings_for(interface)) }

  describe "#usable_for?" do
    it "is usable while the port is open and the settings still match" do
      expect(connection).to be_usable_for(interface)
    end

    it "is not usable once the port has been closed" do
      # A client the poller closed, or one whose adapter was unplugged, must not
      # be handed back out — the next cycle has to reopen.
      client.close

      expect(connection).not_to be_usable_for(interface)
    end

    it "is not usable after a serial setting changes" do
      expect(connection).to be_usable_for(interface)
      interface.update!(parity: "even")

      expect(connection).not_to be_usable_for(interface)
    end

    it "stays usable when a field that doesn't reach the wire changes" do
      expect(connection).to be_usable_for(interface)
      interface.update!(name: "Renamed", enabled: false)

      expect(connection).to be_usable_for(interface)
    end
  end

  describe "#driver_for" do
    let(:device) do
      Device.create!(name: "Relay board", host_interface: interface, driver: "FakePollerDriver", modbus_address: 3)
    end

    before { FakePollerDriver.reset! }

    it "configures once and only caches successful configuration" do
      calls = 0
      allow_any_instance_of(FakePollerDriver).to receive(:configure!) do
        calls += 1
        raise IOError, "configuration failed" if calls == 1
      end
      expect { connection.driver_for(device) }.to raise_error(IOError)
      driver = connection.driver_for(device)
      expect(connection.driver_for(device)).to equal(driver)
      expect(calls).to eq(2)
      device.update!(modbus_address: 4)
      connection.driver_for(device)
      expect(calls).to eq(3)
    end

    it "rebuilds the driver when the device's address changes" do
      connection.driver_for(device)
      device.update!(modbus_address: 4)
      connection.driver_for(device)

      expect(FakePollerDriver.instantiations).to eq(2)
    end

    it "drops cached drivers for devices no longer on the interface" do
      driver = connection.driver_for(device)
      connection.retain_drivers_for([])

      expect(connection.driver_for(device)).not_to equal(driver)
      expect(FakePollerDriver.instantiations).to eq(2)
    end
  end

  describe "#close" do
    it "swallows an error from a port that is already gone" do
      # Closing is how we reach "port released"; a port that died on its own is
      # already in that state, and raising here would abort the cycle.
      allow(client).to receive(:close).and_raise(Errno::EIO)

      expect { connection.close }.not_to raise_error
    end
  end
end
