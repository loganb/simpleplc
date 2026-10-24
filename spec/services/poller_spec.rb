require "rails_helper"
require "tmpdir"

# FakeRtuClient and FakePollerDriver live in spec/support/fake_modbus.rb.
RSpec.describe Poller do
  subject(:poller) { described_class.new(clock: -> { @time || 0.0 }) }

  # A real path on disk, so HostInterface#port_present? answers honestly rather
  # than being stubbed out.
  around do |example|
    Dir.mktmpdir do |dir|
      @port_path = File.join(dir, "ttyUSB0")
      FileUtils.touch(@port_path)
      begin
        example.run
      ensure
        poller.shut_down
      end
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
      poller.run_cycle
      @time = 10.0
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).once
      expect(clients.sole).not_to be_closed
      expect(FakePollerDriver.reads).to eq(2)
    end

    it "reuses driver instances, so a driver's setup writes happen once per connection" do
      # Drivers::N4D8B08#configure! writes the relationship register; rebuilding
      # a driver every cycle would mean a bus write every 10 seconds forever.
      poller.run_cycle
      @time = 10.0
      poller.run_cycle

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
      interface.reload.update!(baud_rate: 19_200)
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).twice
      expect(clients.first).to be_closed
      expect(clients.last).not_to be_closed
    end

    it "does not reconnect when an unrelated field changes" do
      poller.run_cycle
      interface.reload.update!(name: "Renamed Bus")
      poller.run_cycle

      expect(ModBus::RTUClient).to have_received(:connect).once
    end
  end

  describe "interface update periods" do
    it "schedules interfaces independently" do
      other_port = File.join(File.dirname(port_path), "ttyUSB1")
      FileUtils.touch(other_port)
      other = HostInterface.create!(name: "Slow Bus", port: other_port, update_period: 30)
      Device.create!(name: "Sensor", host_interface: other, driver: "FakePollerDriver", modbus_address: 1)
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(2)
      @time = 10.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(3)
      @time = 30.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(5)
    end

    it "reads only when due and applies a period edit immediately without reconnecting" do
      poller.run_cycle
      @time = 9.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(1)
      @time = 10.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(2)
      interface.reload.update!(update_period: 30)
      @time = 11.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(3)
      expect(ModBus::RTUClient).to have_received(:connect).once
      @time = 41.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(4)
    end

    it "reads immediately after serial settings force a reconnect" do
      poller.run_cycle
      interface.reload.update!(baud_rate: 19_200)
      @time = 1.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(2)
      expect(ModBus::RTUClient).to have_received(:connect).twice
    end

    it "does not backfill missed reads after a delayed cycle" do
      poller.run_cycle
      @time = 100.0
      poller.run_cycle
      @time = 101.0
      poller.run_cycle
      expect(FakePollerDriver.reads).to eq(2)
    end

    it "releases a disabled interface before its next read is due" do
      poller.run_cycle
      interface.reload.update!(enabled: false)
      @time = 1.0
      poller.run_cycle
      expect(clients.sole).to be_closed
      expect(FakePollerDriver.reads).to eq(1)
    end
  end

  describe "disabling a bus" do
    it "releases the port and reports offline once the port is actually closed" do
      poller.run_cycle
      interface.reload.update!(enabled: false)
      poller.run_cycle

      expect(clients.sole).to be_closed
      expect(interface.reload).to have_attributes(online: false, connection_error: nil)
      expect(interface.connection_state).to eq("disabled")
    end

    it "reads as disabled immediately, before the poller lets go" do
      poller.run_cycle
      interface.reload.update!(enabled: false)

      expect(interface.reload.connection_state).to eq("disabled")
      expect(clients.sole).not_to be_closed

      poller.run_cycle

      expect(clients.sole).to be_closed
    end

    it "stops polling the devices on that bus" do
      poller.run_cycle
      interface.reload.update!(enabled: false)
      poller.run_cycle

      expect(FakePollerDriver.reads).to eq(1)
    end

    it "never opens the port for a bus that starts out disabled" do
      interface.reload.update!(enabled: false)
      poller.run_cycle

      expect(ModBus::RTUClient).not_to have_received(:connect)
      expect(interface.reload.online).to be(false)
    end

    it "reopens the port when the bus is enabled again" do
      poller.run_cycle
      interface.reload.update!(enabled: false)
      poller.run_cycle
      interface.reload.update!(enabled: true)
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
      interface.reload.update!(port: "/dev/ttyUSB-nope")

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

  describe "address relocation" do
    before do
      device.update!(settings: {}) # FakePollerDriver defines no settings
      FakePollerDriver.read_behaviour = -> { raise ModBus::Errors::ModBusTimeout, "no answer" }
    end

    it "commits the new address and clears the address setting once the driver finds the module there" do
      allow_any_instance_of(FakePollerDriver).to receive(:relocated_address).and_return(9)
      device.update_columns(settings: { "address" => 9 })
      poller.run_cycle

      expect(device.reload).to have_attributes(modbus_address: 9, settings: {})
    end

    it "leaves the device alone while the driver reports nothing" do
      poller.run_cycle

      expect(device.reload.modbus_address).to eq(3)
    end

    it "keeps polling the other devices when the commit is refused" do
      Device.create!(name: "Taken", host_interface: interface, driver: "FakePollerDriver", modbus_address: 9)
      allow_any_instance_of(FakePollerDriver).to receive(:relocated_address).and_return(9)
      expect { poller.run_cycle }.not_to raise_error

      expect(device.reload.modbus_address).to eq(3)
    end
  end

  describe "device scans" do
    let(:scan) { DeviceScan.create!(host_interface: interface, first_address: 1, last_address: 2) }

    before { interface.update!(enabled: false) }

    it "runs a pending scan on a disabled bus instead of polling it" do
      scan
      allow(HardwareScan).to receive(:new).and_call_original
      allow_any_instance_of(HardwareScan).to receive(:run)
      poller.run_cycle

      expect(HardwareScan).to have_received(:new).with(scan, hash_including(:stopping))
      expect(FakePollerDriver.reads).to eq(0)
    end

    it "never scans an enabled bus" do
      interface.update!(enabled: true)
      allow(HardwareScan).to receive(:new)
      poller.run_cycle

      expect(HardwareScan).not_to have_received(:new)
    end

    it "releases a port it was holding before scanning" do
      interface.update!(enabled: true)
      poller.run_cycle
      interface.reload.update!(enabled: false)
      scan
      allow_any_instance_of(HardwareScan).to receive(:run)
      poller.run_cycle

      expect(clients.sole).to be_closed
    end

    it "fails scans left running by a previous poller when it starts" do
      scan.update!(state: "running")
      allow(poller).to receive(:trap_signals)
      poller.instance_variable_set(:@stopping, true)
      poller.run

      expect(scan.reload).to have_attributes(state: "failed", error: "Poller restarted")
    end

    it "fails a running scan on shutdown" do
      scan.update!(state: "running")
      poller.shut_down

      expect(scan.reload).to have_attributes(state: "failed", error: "Poller stopped")
    end

    it "leaves pending scans for the next poller" do
      scan
      poller.shut_down

      expect(scan.reload.state).to eq("pending")
    end
  end

  describe "releasing ports" do
    it "closes the port of an interface deleted between cycles" do
      poller.run_cycle
      interface.reload.destroy!
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

  describe "observation persistence" do
    it "closes every port and continues reporting after a validation failure" do
      other_path = "#{port_path}-other"
      FileUtils.touch(other_path)
      other = HostInterface.create!(name: "Other", port: other_path)
      poller.run_cycle
      failing_id = interface.id
      callback = ->(record) { record.errors.add(:base, "report rejected") if record.id == failing_id && !record.online }
      HostInterface.set_callback(:validation, :before, callback)
      begin
        expect { poller.shut_down }.not_to raise_error
        expect(clients).to all(be_closed)
        expect(other.reload.online).to be(false)
      ensure
        HostInterface.skip_callback(:validation, :before, callback)
      end
    end

    it "preserves a concurrent edit without repeating hardware IO" do
      FakePollerDriver.read_behaviour = -> {
        device.reload.update!(name: "Renamed")
        { ok: true }
      }
      poller.run_cycle
      expect(device.reload).to have_attributes(name: "Renamed", lock_version: 2)
      expect(device.current_state.dig("data", "ok")).to be(true)
      expect(FakePollerDriver.reads).to eq(1)
    end

    it "discards a sample if its device address changed during the read" do
      FakePollerDriver.read_behaviour = -> {
        device.reload.update!(modbus_address: 4)
        { ok: true }
      }
      poller.run_cycle
      expect(device.reload.current_state).to be_nil
      expect(FakePollerDriver.reads).to eq(1)
    end

    it "runs device and interface update callbacks including shutdown reports" do
      updates = []
      callback = ->(record) { updates << [ record.class, record.id ] }
      Device.set_callback(:update, :after, callback)
      HostInterface.set_callback(:update, :after, callback)
      begin
        poller.run_cycle
        poller.shut_down
        expect(updates.count([ Device, device.id ])).to eq(1)
        expect(updates.count([ HostInterface, interface.id ])).to eq(2)
      ensure
        Device.skip_callback(:update, :after, callback)
        HostInterface.skip_callback(:update, :after, callback)
      end
    end

    it "continues when a device was deleted during a read" do
      FakePollerDriver.read_behaviour = -> {
        device.reload.destroy!
        { ok: true }
      }
      expect { poller.run_cycle }.not_to raise_error
      expect(interface.reload.online).to be(true)
    end
  end

  describe "batched persistence" do
    let!(:second_device) do
      Device.create!(name: "Second board", host_interface: interface, driver: "FakePollerDriver", modbus_address: 4)
    end

    it "keeps database writes out of serial IO and commits them asynchronously at the end" do
      seen_during_reads = []
      FakePollerDriver.read_behaviour = -> {
        seen_during_reads << Device.where.not(last_polled_at: nil).count
        { ok: true }
      }
      commit_modes = []
      allow_any_instance_of(Device).to receive(:persist_observation).and_wrap_original do |original, *args, **kwargs|
        commit_modes << ActiveRecord::Base.connection.select_value("SHOW synchronous_commit")
        original.call(*args, **kwargs)
      end

      poller.run_cycle

      expect(seen_during_reads).to eq([ 0, 0 ])
      expect(commit_modes).to eq([ "off", "off" ])
      expect(Device.where.not(last_polled_at: nil).count).to eq(2)
      expect(interface.reload.online).to be(true)
    end

    it "logs and skips one record that fails without blocking the others" do
      first_id = device.id
      callback = ->(record) { record.errors.add(:base, "rejected") if record.id == first_id }
      Device.set_callback(:validation, :before, callback)
      allow(Rails.logger).to receive(:warn)
      begin
        poller.run_cycle
      ensure
        Device.skip_callback(:validation, :before, callback)
      end

      expect(device.reload.current_state).to be_nil
      expect(second_device.reload.current_state).to include("status" => "ok")
      expect(interface.reload.online).to be(true)
      expect(Rails.logger).to have_received(:warn).with(/unable to persist Device #{first_id}/)
    end

    it "rolls a failed statement back to its savepoint so later records still commit" do
      first_id = device.id
      allow(Rails.logger).to receive(:warn)
      allow_any_instance_of(Device).to receive(:persist_observation).and_wrap_original do |original, *args, **kwargs|
        if original.receiver.id == first_id
          ActiveRecord::Base.connection.execute("SELECT * FROM table_that_does_not_exist")
        end
        original.call(*args, **kwargs)
      end

      poller.run_cycle

      expect(device.reload.current_state).to be_nil
      expect(second_device.reload.current_state).to include("status" => "ok")
      expect(interface.reload.online).to be(true)
      expect(Rails.logger).to have_received(:warn).with(/dropped a buffered write: ActiveRecord::StatementInvalid/)
    end

    it "retries a stale record without touching the others" do
      FakePollerDriver.read_behaviour = -> {
        Device.where(id: second_device.id).update_all("lock_version = lock_version + 1")
        { ok: true }
      }

      poller.run_cycle

      expect(second_device.reload.current_state).to include("status" => "ok")
      expect(device.reload.current_state).to include("status" => "ok")
    end

    it "records the offline report, and earlier devices' observations, after a mid-cycle connection error" do
      FakePollerDriver.read_behaviour = -> {
        FakePollerDriver.reads == 1 ? { ok: true } : raise(Errno::EIO)
      }

      poller.run_cycle

      expect(device.reload.current_state).to include("status" => "ok")
      expect(interface.reload).to have_attributes(online: false)
      expect(interface.connection_error).to include("Errno::EIO")
      expect(clients.sole).to be_closed
    end

    it "still flushes buffered writes when the cycle fails outright" do
      allow(poller).to receive(:release).and_raise("boom")

      expect { poller.run_cycle }.to raise_error("boom")

      expect(device.reload.current_state).to include("status" => "ok")
    end
  end

  describe "flushing the line" do
    it "flushes a bus once when it is opened, and not again while devices answer" do
      2.times { poller.run_cycle }

      expect(clients.sole.flushes).to eq(1)
    end

    it "flushes after a device fails, so its stale bytes can't reach the next transaction" do
      poller.run_cycle
      FakePollerDriver.read_behaviour = -> { raise ModBus::Errors::ModBusTimeout, "timed out" }
      @time = 10.0

      expect { poller.run_cycle }.to change { clients.sole.flushes }.by(1)
    end

    it "flushes after a failed output write" do
      binding = instance_double(LogicOutputBinding, id: 1)
      command = Logic::OutputWriter::Command.new(output_binding: binding, device: device, channel: 2, desired_output: true)
      allow_any_instance_of(Logic::OutputWriter).to receive(:enabled_commands_by_device_id).and_return(device.id => [ command ])
      allow_any_instance_of(FakePollerDriver).to receive(:open).and_raise(ModBus::Errors::ModBusTimeout, "no ack")
      poller.run_cycle
      before = clients.sole.flushes

      @time = 10.0
      poller.run_cycle

      expect(clients.sole.flushes).to eq(before + 1)
    end

    it "treats a flush that hits a dead port as a connection error" do
      poller.run_cycle
      allow(clients.sole).to receive(:flush_line).and_raise(Errno::EIO)
      FakePollerDriver.read_behaviour = -> { raise ModBus::Errors::ModBusTimeout, "timed out" }

      @time = 10.0
      poller.run_cycle

      expect(clients.sole).to be_closed
      expect(interface.reload.connection_error).to include("Errno::EIO")
    end
  end

  describe "output writes" do
    let(:binding) { instance_double(LogicOutputBinding, id: 1) }
    let(:command) do
      Logic::OutputWriter::Command.new(output_binding: binding, device: device, channel: 2, desired_output: true)
    end
    let(:writes) { [] }

    before do
      allow_any_instance_of(Logic::OutputWriter).to receive(:enabled_commands_by_device_id).and_return(device.id => [ command ])
      allow_any_instance_of(FakePollerDriver).to receive(:open) { |_driver, channel| writes << [ :open, channel ] }
      allow_any_instance_of(FakePollerDriver).to receive(:close) { |_driver, channel| writes << [ :close, channel ] }
    end

    it "writes a relay whose read-back differs from the desired state" do
      FakePollerDriver.read_behaviour = -> { { outputs: [ false, false ] } }

      poller.run_cycle

      expect(writes).to eq([ [ :open, 2 ] ])
    end

    it "leaves a relay alone when its read-back already matches" do
      FakePollerDriver.read_behaviour = -> { { outputs: [ false, true ] } }

      poller.run_cycle

      expect(writes).to be_empty
      expect(device.reload.current_state).to include("status" => "ok")
    end

    it "writes when the driver reports no read-back" do
      poller.run_cycle

      expect(writes).to eq([ [ :open, 2 ] ])
    end
  end

  describe "cycle timing" do
    it "polls once a second" do
      expect(described_class::POLL_INTERVAL).to eq(1.second)
    end

    it "warns about an overrunning cycle only" do
      allow(Rails.logger).to receive(:warn)

      poller.record_cycle_time(0.2)
      expect(Rails.logger).not_to have_received(:warn)

      poller.record_cycle_time(1.4)
      expect(Rails.logger).to have_received(:warn).with(/cycle took 1\.400s, over the 1s interval/)
    end

    it "logs a summary every CYCLE_LOG_EVERY cycles" do
      allow(Rails.logger).to receive(:info)

      described_class::CYCLE_LOG_EVERY.times { |n| poller.record_cycle_time(n.zero? ? 0.5 : 0.1) }

      expect(Rails.logger).to have_received(:info).with(/last 60 cycles averaged 0\.107s, max 0\.500s/)
    end
  end
end
