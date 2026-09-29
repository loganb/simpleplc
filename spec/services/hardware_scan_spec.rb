require "rails_helper"

RSpec.describe "Hardware scanning" do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }

  it "requires a disabled bus, protects active work, and cancels a pending scan outright" do
    interface.update!(enabled: true)
    expect { HardwareScan.request(interface, {}) }.to raise_error(HardwareError)
    interface.update!(enabled: false)
    HardwareScan.request(interface, { "first_address" => 1, "last_address" => 2 })
    expect(interface.reload.scan_state).to eq("requested")
    expect(interface.scan_request_id).to be_present
    expect { HardwareScan.request(interface, {}) }.to raise_error(HardwareError, /already pending/)
    HardwareScan.cancel(interface)
    expect(interface.reload.scan_state).to eq("cancelled")
    HardwareScan.cancel(interface)
    expect(interface.reload.scan_state).to eq("cancelled")
    expect(interface.enabled).to be(false)
  end

  it "gives each new scan its own server-generated id" do
    HardwareScan.request(interface, {})
    first = interface.reload.scan_request_id
    interface.update!(scan_state: "completed")
    HardwareScan.request(interface, {})
    expect(interface.reload.scan_request_id).not_to eq(first)
  end

  it "only lets clients request or cancel" do
    expect { HardwareScan.transition(interface, "completed", {}) }.to raise_error(HardwareError, /requested or cancelling/)
    HardwareScan.transition(interface, "requested", {})
    expect(interface.reload.scan_state).to eq("requested")
    HardwareScan.transition(interface, "cancelling", {})
    expect(interface.reload.scan_state).to eq("cancelled")
  end

  it "records all driver verdicts and never configures a discovered board" do
    HardwareScan.request(interface, { "first_address" => 1, "last_address" => 2 })
    registers = Object.new
    def registers.[](range)
      return 2532 if range == 247
      range.is_a?(Range) ? Array.new(range.size, 0) : 0
    end
    slave = Struct.new(:holding_registers, :input_registers).new(registers, registers)
    client = FakeRtuClient.new
    allow(client).to receive(:with_slave).and_return(slave)
    allow(SerialBusLock).to receive(:acquire).and_return(double(close: nil))
    allow(ModBus::RTUClient).to receive(:connect).and_return(client)
    Drivers::Registry.all.each { |klass| expect_any_instance_of(klass).not_to receive(:configure!) }
    HardwareScan.new(interface).run
    interface.reload
    expect(interface.scan_state).to eq("completed")
    expect(interface.scan_results["devices"].size).to eq(2)
    support = interface.scan_results["devices"].first["driver_support"]
    expect(support.map { |s| s["driver"] }).to match_array(Drivers::Registry.all.map(&:name))
    expect(support.find { |s| s["driver"] == "Drivers::NT48C32" }["support"]).to eq("yes")
    expect(interface.enabled).to be(false)
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
  it "marks an abandoned running scan interrupted, retaining results" do
    HardwareScan.request(interface, {})
    interface.update!(scan_state: "scanning", scan_results: { devices: [ { address: 1 } ] })
    HardwareScan.new(interface).run
    expect(interface.reload.scan_state).to eq("interrupted")
    expect(interface.scan_results["devices"]).to eq([ { "address" => 1 } ])
    expect(interface.enabled).to be(false)
  end

  it "finishes an abandoned cancelling scan as cancelled, retaining results" do
    HardwareScan.request(interface, {})
    interface.update!(scan_state: "cancelling", scan_results: { devices: [ { address: 1 } ] })
    HardwareScan.new(interface).run
    expect(interface.reload.scan_state).to eq("cancelled")
    expect(interface.scan_results["devices"]).to eq([ { "address" => 1 } ])
  end

  it "cancels between serial transactions and closes the client" do
    HardwareScan.request(interface, { "first_address" => 1, "last_address" => 5 })
    registers = double
    slave = double(holding_registers: registers)
    client = FakeRtuClient.new
    allow(client).to receive(:with_slave).and_return(slave)
    states = []
    allow(registers).to receive(:[]) do
      bus = HostInterface.find(interface.id)
      HardwareScan.cancel(bus)
      states << bus.reload.scan_state
      0
    end
    allow(SerialBusLock).to receive(:acquire).and_return(double(close: nil))
    allow(ModBus::RTUClient).to receive(:connect).and_return(client)
    HardwareScan.new(interface).run
    expect(states.first).to eq("cancelling")
    expect(interface.reload.scan_state).to eq("cancelled")
    expect(client).to be_closed
    expect(interface.scan_results["devices"].first["driver_support"]).to all(include("support" => "maybe"))
  end

  it "bounds address/profile options and does not accept a malformed request" do
    expect { HardwareScan.request(interface, { "first_address" => 0 }) }.to raise_error(HardwareError)
    expect { HardwareScan.request(interface, { "profiles" => [] }) }.to raise_error(HardwareError)
    expect(interface.reload.scan_state).to eq("idle")
  end
  it "rechecks adapter ownership when a previously missing port appears" do
    Dir.mktmpdir do |dir|
      port = File.join(dir, "late-adapter")
      first = HostInterface.create!(name: "First", port: port, enabled: false)
      second = HostInterface.create!(name: "Second", port: port, enabled: false)
      File.write(port, "")
      first.identify_port
      first.save!
      HardwareScan.request(second, { "first_address" => 1, "last_address" => 1 })
      expect(ModBus::RTUClient).not_to receive(:connect)
      HardwareScan.new(second).run
      expect(second.reload.scan_state).to eq("failed")
    end
  end
end
