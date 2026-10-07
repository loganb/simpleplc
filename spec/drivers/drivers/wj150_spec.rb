require "rails_helper"

RSpec.describe Drivers::WJ150 do
  class WJ150Registers
    attr_reader :writes

    def initialize(values) = (@values, @writes = values, [])

    def [](address)
      address.is_a?(Range) ? address.map { |register| @values.fetch(register, 0) } : @values.fetch(address, 0)
    end

    def []=(address, value)
      @writes << [ address, value ]
      @values[address] = value
    end
  end

  class WJ150Slave
    attr_reader :holding_registers

    def initialize(values) = @holding_registers = WJ150Registers.new(values)
  end

  let(:settings) { {} }
  let(:device) { instance_double(Device, settings: settings, modbus_address: 5) }
  let(:registers) { { 0 => 1 } }
  let(:slave) { WJ150Slave.new(registers) }
  let(:driver) { described_class.new(device, slave) }

  describe ".inputs" do
    it "lists a count and a frequency per channel" do
      expect(described_class.inputs.map { |i| i[:path] }).to eq(%w[counts[0] counts[1] frequencies[0] frequencies[1]])
      expect(described_class.inputs.first).to eq(path: "counts[0]", label: "Channel A count", value_type: "number", units: "pulses")
      expect(described_class.outputs).to be_empty
    end
  end

  describe "#read" do
    it "combines low-word-first registers into unsigned counts, per channel" do
      registers.merge!(32 => 0xCA90, 33 => 0xFFFF, 34 => 7, 35 => 0)

      expect(driver.read[:counts]).to eq([ 4_294_953_616, 7 ])
    end

    it "decodes frequencies as low-word-first float32" do
      bits = [ 1000.5 ].pack("g").unpack1("N")
      registers.merge!(144 => bits & 0xFFFF, 145 => bits >> 16)

      expect(driver.read[:frequencies]).to eq([ 1000.5, 0.0 ])
    end

    it "raises, rather than reporting zero counts, when not in two-counter mode" do
      registers[0] = 0

      expect { driver.read }.to raise_error(/encoder mode/)
    end

    it "never writes" do
      driver.read

      expect(slave.holding_registers.writes).to be_empty
    end
  end

  describe "#configure!" do
    it "only forces counter mode when no settings are managed" do
      registers[0] = 0
      driver.configure!

      expect(slave.holding_registers.writes).to eq([ [ 0, 1 ] ])
    end

    it "writes managed settings that differ and skips those already correct" do
      registers.merge!(81 => 1, 180 => 20, 181 => 0, 200 => 5)
      settings.merge!("pull_up" => true, "filter_a_ms" => 20, "filter_b_ms" => 50, "address" => 9)
      driver.configure!

      expect(slave.holding_registers.writes).to eq([ [ 181, 50 ], [ 200, 9 ] ])
    end

    it "leaves unmanaged registers alone" do
      registers.merge!(81 => 1, 180 => 77)
      driver.configure!

      expect(slave.holding_registers.writes).to be_empty
    end
  end

  describe ".normalize_settings" do
    it "accepts valid settings" do
      expect(described_class.normalize_settings("address" => 9, "pull_up" => false)).to eq("address" => 9, "pull_up" => false)
    end

    it "rejects unknown keys, bad types and out-of-range values" do
      expect { described_class.normalize_settings("mode" => 1) }.to raise_error(ArgumentError, /unknown/)
      expect { described_class.normalize_settings("pull_up" => 1) }.to raise_error(ArgumentError, /true or false/)
      expect { described_class.normalize_settings("address" => 0) }.to raise_error(ArgumentError, /between 1 and 247/)
      expect { described_class.normalize_settings("filter_a_ms" => "20") }.to raise_error(ArgumentError, /whole number/)
    end
  end

  describe "#relocated_address" do
    let(:client) { instance_double(ModBus::RTUClient) }
    let(:new_slave) { WJ150Slave.new(210 => 0x0150) }

    before { allow(client).to receive(:with_slave).with(9).and_return(new_slave) }

    it "returns the wanted address once the module answers there with its product ID" do
      settings["address"] = 9

      expect(driver.relocated_address(client)).to eq(9)
    end

    it "returns nil without an address setting, or when it matches the current address" do
      expect(driver.relocated_address(client)).to be_nil
      settings["address"] = 5
      expect(driver.relocated_address(client)).to be_nil
    end

    it "returns nil when nothing answers or something else does" do
      settings["address"] = 9
      allow(new_slave.holding_registers).to receive(:[]).and_raise(ModBus::Errors::ModBusTimeout)
      expect(driver.relocated_address(client)).to be_nil

      allow(new_slave.holding_registers).to receive(:[]).and_return(0x1234)
      expect(driver.relocated_address(client)).to be_nil
    end
  end

  describe ".device_support" do
    def verdict(result) = described_class.device_support(instance_double(Drivers::Probe, read: result).tap { |p|
      allow(p).to receive(:verdict) { |support, reason| { support: support, reason: reason } } })[:support]

    it "identifies the product by register 210" do
      expect(verdict(status: "ok", values: 0x0150)).to eq("yes")
      expect(verdict(status: "ok", values: 2532)).to eq("no")
      expect(verdict(status: "unsupported")).to eq("no")
      expect(verdict(status: "timeout")).to eq("maybe")
    end
  end
end
