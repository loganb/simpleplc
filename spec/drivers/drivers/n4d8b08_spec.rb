require "rails_helper"

RSpec.describe Drivers::N4D8B08 do
  class FakeHoldingRegisters
    attr_reader :writes

    def initialize(values = {})
      @values = values
      @writes = []
    end

    def [](address)
      if address.is_a?(Range)
        address.map { |register| @values.fetch(register, 0x0000) }
      else
        @values.fetch(address, 0x0000)
      end
    end

    def []=(address, value)
      @writes << [ address, value ]
      @values[address] = value
    end
  end

  class FakeSlave
    attr_reader :holding_registers

    def initialize(values = {})
      @holding_registers = FakeHoldingRegisters.new(values)
    end
  end

  let(:device) { instance_double(Device) }
  let(:slave) { FakeSlave.new(register_values) }
  let(:register_values) { {} }

  it "configures inputs and outputs as unrelated when initialized" do
    described_class.new(device, slave)

    expect(slave.holding_registers.writes).to include([ 0x00FD, 0x0000 ])
  end

  it "reads output and input channel states" do
    register_values.merge!(
      0x0001 => 0x0001,
      0x0002 => 0x0000,
      0x0081 => 0x0000,
      0x0082 => 0x0001
    )

    driver = described_class.new(device, slave)

    expect(driver.read).to include(
      outputs: [ true, false, false, false, false, false, false, false ],
      inputs: [ false, true, false, false, false, false, false, false ]
    )
  end

  it "writes only output command registers after initialization" do
    driver = described_class.new(device, slave)
    slave.holding_registers.writes.clear

    driver.open(2)
    driver.close(3)
    driver.toggle(4)

    expect(slave.holding_registers.writes).to eq([
      [ 2, 0x0100 ],
      [ 3, 0x0200 ],
      [ 4, 0x0300 ]
    ])
  end

  it "writes delay seconds in the low byte of the delay command" do
    driver = described_class.new(device, slave)
    slave.holding_registers.writes.clear

    driver.delay_open(2, 5)

    expect(slave.holding_registers.writes).to eq([[ 2, 0x0605 ]])
  end
end
