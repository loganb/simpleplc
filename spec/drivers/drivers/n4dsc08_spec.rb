require "rails_helper"

RSpec.describe Drivers::N4DSC08 do
  class DSC08Registers
    attr_reader :writes

    def initialize(values = {}) = (@values, @writes = values, [])

    def [](address)
      address.is_a?(Range) ? address.map { |register| @values.fetch(register, 0) } : @values.fetch(address, 0)
    end

    def []=(address, value)
      @writes << [ address, value ]
      raise ModBus::Errors::ModBusTimeout, "moved" if @moves
      @values[address] = value
    end

    def lose_replies! = @moves = true
  end

  class DSC08Slave
    attr_reader :holding_registers, :input_registers

    def initialize(holding = {}, input = {})
      @holding_registers = DSC08Registers.new(holding)
      @input_registers = DSC08Registers.new(input)
    end
  end

  let(:settings) { {} }
  let(:device) { instance_double(Device, settings: settings, modbus_address: 1) }
  let(:slave) { DSC08Slave.new(0xFD => 1) }
  let(:driver) { described_class.new(device, slave) }

  it "declares only the address setting, with no power cycle needed" do
    expect(described_class.settings_schema).to match([ include(key: "address", min: 1, max: 247, requires_power_cycle: false) ])
  end

  describe "#configure!" do
    it "does nothing without an address setting" do
      driver.configure!

      expect(slave.holding_registers.writes).to be_empty
    end

    it "writes the address register when it differs" do
      settings["address"] = 2
      driver.configure!

      expect(slave.holding_registers.writes).to eq([ [ 0xFD, 2 ] ])
    end

    it "does not rewrite an address already set" do
      settings["address"] = 1
      driver.configure!

      expect(slave.holding_registers.writes).to be_empty
    end

    it "tolerates the reply being lost because the module changed address" do
      slave.holding_registers.lose_replies!
      settings["address"] = 2

      expect { driver.configure! }.not_to raise_error
    end
  end

  describe "#relocated_address" do
    let(:client) { instance_double(ModBus::RTUClient) }

    before { settings["address"] = 2 }

    it "finds the board at the new address by its address register and temperature registers" do
      allow(client).to receive(:with_slave).with(2).and_return(DSC08Slave.new({ 0xFD => 2 }))

      expect(driver.relocated_address(client)).to eq(2)
    end

    it "does not accept another device that merely answers there" do
      allow(client).to receive(:with_slave).with(2).and_return(DSC08Slave.new({ 0xFD => 0 }))

      expect(driver.relocated_address(client)).to be_nil
    end
  end
end
