require "rails_helper"

RSpec.describe "Hardware scanning" do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }

  it "requires a disabled bus, protects active work, and cancels by attempt" do
    interface.update!(enabled: true)
    expect { HardwareScan.request(interface, "a", {}) }.to raise_error(HardwareError)
    interface.update!(enabled: false)
    HardwareScan.request(interface, "a", { "first_address" => 1, "last_address" => 2 })
    expect(interface.reload.scan_state).to eq("requested")
    HardwareScan.request(interface, "a", {})
    expect { HardwareScan.request(interface, "b", {}) }.to raise_error(HardwareError)
    expect { HardwareScan.cancel(interface, "b") }.to raise_error(HardwareError)
    HardwareScan.cancel(interface, "a")
    expect(interface.reload.scan_state).to eq("cancelled")
    expect(interface.enabled).to be(false)
  end

  it "records all driver verdicts and never configures a discovered board" do
    HardwareScan.request(interface, "a", { "first_address" => 1, "last_address" => 2 })
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
    HardwareScan.request(interface, "a", {})
    interface.update!(scan_state: "scanning", scan_results: { devices: [ { address: 1 } ] })
    HardwareScan.new(interface).run
    expect(interface.reload.scan_state).to eq("interrupted")
    expect(interface.scan_results["devices"]).to eq([ { "address" => 1 } ])
    expect(interface.enabled).to be(false)
  end

  it "cancels between serial transactions and closes the client" do
    HardwareScan.request(interface, "a", { "first_address" => 1, "last_address" => 5 })
    registers = double
    slave = double(holding_registers: registers)
    client = FakeRtuClient.new
    allow(client).to receive(:with_slave).and_return(slave)
    allow(registers).to receive(:[]) do
      HardwareScan.cancel(HostInterface.find(interface.id), "a")
      0
    end
    allow(SerialBusLock).to receive(:acquire).and_return(double(close: nil))
    allow(ModBus::RTUClient).to receive(:connect).and_return(client)
    HardwareScan.new(interface).run
    expect(interface.reload.scan_state).to eq("cancelled")
    expect(client).to be_closed
    expect(interface.scan_results["devices"].first["driver_support"]).to all(include("support" => "maybe"))
  end

  it "bounds address/profile options and does not accept a malformed request" do
    expect { HardwareScan.request(interface, "a", { "first_address" => 0 }) }.to raise_error(HardwareError)
    expect { HardwareScan.request(interface, "a", { "profiles" => [] }) }.to raise_error(HardwareError)
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
      HardwareScan.request(second, "claim-test", { "first_address" => 1, "last_address" => 1 })
      expect(ModBus::RTUClient).not_to receive(:connect)
      HardwareScan.new(second).run
      expect(second.reload.scan_state).to eq("failed")
    end
  end

end
