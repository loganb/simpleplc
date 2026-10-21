require "rails_helper"

RSpec.describe HardwareScan do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }
  let(:scan) { DeviceScan.create!(host_interface: interface, first_address: 1, last_address: 2) }

  def stub_bus(slave:, client: FakeRtuClient.new)
    allow(client).to receive(:with_slave).and_return(slave)
    allow(SerialBusLock).to receive(:acquire).and_return(double(close: nil))
    allow(ModBus::RTUClient).to receive(:connect).and_return(client)
    client
  end

  it "records all driver verdicts at the bus's own settings and never configures a discovered board" do
    interface.update!(baud_rate: 19_200)
    registers = Object.new
    def registers.[](range)
      return 2532 if range == 247
      range.is_a?(Range) ? Array.new(range.size, 0) : 0
    end
    client = stub_bus(slave: Struct.new(:holding_registers, :input_registers).new(registers, registers))
    Drivers::Registry.all.each { |klass| expect_any_instance_of(klass).not_to receive(:configure!) }
    described_class.new(scan).run
    expect(ModBus::RTUClient).to have_received(:connect).with("/dev/missing", 19_200, hash_including(data_bits: 8, parity: :none))
    scan.reload
    expect(scan).to have_attributes(state: "done", completed: 2, total: 2, error: nil)
    expect(scan.started_at).to be_present
    expect(scan.finished_at).to be_present
    expect(scan.results.map { |r| r["address"] }).to eq([ 1, 2 ])
    support = scan.results.first["driver_support"]
    expect(support.map { |s| s["driver"] }).to match_array(Drivers::Registry.all.map(&:name))
    expect(support.find { |s| s["driver"] == "Drivers::NT48C32" }["support"]).to eq("yes")
    expect(interface.reload.enabled).to be(false)
    expect(client).to be_closed
  end

  it "finishes with no results when nothing responds" do
    registers = double
    allow(registers).to receive(:[]).and_raise(ModBus::Errors::ModBusTimeout)
    client = stub_bus(slave: double(holding_registers: registers, input_registers: registers))
    described_class.new(scan).run
    expect(scan.reload).to have_attributes(state: "done", completed: 2, results: [])
    expect(client).to be_closed
  end

  it "distinguishes unknown evidence from positive incompatibility" do
    slave = double
    allow(slave).to receive(:holding_registers).and_raise(ModBus::Errors::ModBusTimeout)
    verdict = Drivers::NT48C32.device_support(Drivers::Probe.new(slave))
    expect(verdict[:support]).to eq("maybe")
    regs = double
    allow(regs).to receive(:[]).with(247).and_return(2608)
    allow(slave).to receive(:holding_registers).and_return(regs)
    expect(Drivers::NT48C32.device_support(Drivers::Probe.new(slave))[:support]).to eq("no")
  end

  it "stops between serial transactions when cancelled and closes the client" do
    scan = DeviceScan.create!(host_interface: interface, first_address: 1, last_address: 5)
    registers = double
    calls = 0
    allow(registers).to receive(:[]) do
      calls += 1
      DeviceScan.find(scan.id).tap { |s| s.update!(state: "cancelled", finished_at: Time.current) } if calls == 1
      0
    end
    client = stub_bus(slave: double(holding_registers: registers, input_registers: registers))
    described_class.new(scan).run
    scan.reload
    expect(scan.state).to eq("cancelled")
    expect(scan.completed).to be < scan.total
    expect(scan.finished_at).to be_present
    expect(client).to be_closed
  end

  context "with the query cache on, as in the poller's reloader wrap" do
    self.use_transactional_tests = false

    after { interface.destroy! }

    it "notices a cancel written by another process at the next checkpoint" do
      scan = DeviceScan.create!(host_interface: interface, first_address: 1, last_address: 20)
      other = ActiveRecord::Base.connection_pool.new_connection
      registers = double
      calls = 0
      allow(registers).to receive(:[]) do
        calls += 1
        other.raw_connection.exec("UPDATE device_scans SET state = 'cancelled' WHERE id = #{scan.id}") if calls == 1
        raise ModBus::Errors::ModBusTimeout
      end
      stub_bus(slave: double(holding_registers: registers, input_registers: registers))
      ActiveRecord::Base.cache { described_class.new(scan).run }
      expect(scan.reload).to have_attributes(state: "cancelled", completed: 0)
    ensure
      other&.disconnect!
    end
  end

  it "does not start a scan that was cancelled while pending" do
    scan.update!(state: "cancelled")
    expect(ModBus::RTUClient).not_to receive(:connect)
    described_class.new(scan).run
    expect(scan.reload.state).to eq("cancelled")
  end

  it "does not start a scan on a bus that is enabled" do
    scan
    interface.update_columns(enabled: true)
    expect(ModBus::RTUClient).not_to receive(:connect)
    described_class.new(scan).run
    expect(scan.reload.state).to eq("pending")
  end

  it "fails when asked to stop, rather than leaving it running" do
    client = stub_bus(slave: double)
    described_class.new(scan, stopping: -> { true }).run
    expect(scan.reload).to have_attributes(state: "failed", error: "Poller stopped")
    expect(client).to be_closed
  end

  it "fails with the reason when the port cannot be used" do
    described_class.new(scan).run
    expect(scan.reload.state).to eq("failed")
    expect(scan.error).to be_present
  end

  it "fails abandoned running scans, retaining their results" do
    scan.update!(state: "running", results: [ { address: 1 } ])
    other = DeviceScan.create!(host_interface: HostInterface.create!(name: "Other", port: "/dev/other", enabled: false), first_address: 1, last_address: 1)
    described_class.fail_running("Poller restarted")
    expect(scan.reload).to have_attributes(state: "failed", error: "Poller restarted", results: [ { "address" => 1 } ])
    expect(scan.finished_at).to be_present
    expect(other.reload.state).to eq("pending")
  end

  it "rechecks adapter ownership when a previously missing port appears" do
    Dir.mktmpdir do |dir|
      port = File.join(dir, "late-adapter")
      first = HostInterface.create!(name: "First", port: port, enabled: false)
      second = HostInterface.create!(name: "Second", port: port, enabled: false)
      File.write(port, "")
      first.identify_port
      first.save!
      late = DeviceScan.create!(host_interface: second, first_address: 1, last_address: 1)
      expect(ModBus::RTUClient).not_to receive(:connect)
      described_class.new(late).run
      expect(late.reload.state).to eq("failed")
    end
  end
end
