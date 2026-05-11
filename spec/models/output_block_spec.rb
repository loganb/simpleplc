require "rails_helper"

RSpec.describe OutputBlock, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:host) { HostInterface.create!(port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay board", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 3) }

  it "accepts a valid binary output block" do
    Measurement.create!(logic_diagram: diagram, name: "Heat_Call", mode: "simulation", simulation_value: 1.0)

    output = described_class.new(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "Heat_Call",
      output_enable: true
    )

    expect(output).to be_valid
  end

  it "defaults output_enable to false" do
    output = described_class.create!(
      logic_diagram: diagram,
      name: "Pump_Enable",
      device: device,
      channel: 1,
      input_expression: "true"
    )

    expect(output).not_to be_output_enable
  end

  it "rejects expression-unsafe names" do
    output = described_class.new(
      logic_diagram: diagram,
      name: "Boiler Enable",
      device: device,
      channel: 1,
      input_expression: "true"
    )

    expect(output).not_to be_valid
    expect(output.errors[:name].join).to include("expression-safe identifier")
  end

  it "rejects unknown expression references" do
    output = described_class.new(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "Missing_Call"
    )

    expect(output).not_to be_valid
    expect(output.errors[:input_expression].join).to include("unknown name Missing_Call")
  end

  it "rejects unsupported output channels" do
    output = described_class.new(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 9,
      input_expression: "true"
    )

    expect(output).not_to be_valid
    expect(output.errors[:channel].join).to include("between 1 and 8")
  end
end
