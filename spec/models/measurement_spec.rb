require "rails_helper"

RSpec.describe Measurement, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "requires expression-safe unique names" do
    measurement = described_class.new(logic_diagram: diagram, name: "DHW Temp")

    expect(measurement).not_to be_valid
    expect(measurement.errors[:name].join).to include("expression-safe identifier")
  end

  it "scopes names to a logic diagram" do
    other = LogicDiagram.create!(name: "Other")
    described_class.create!(logic_diagram: diagram, name: "DHW_Temp")

    expect(described_class.new(logic_diagram: diagram, name: "DHW_Temp")).not_to be_valid
    expect(described_class.new(logic_diagram: other, name: "DHW_Temp")).to be_valid
  end

  it "allows simulation measurements without hardware" do
    measurement = described_class.new(
      logic_diagram: diagram,
      name: "OutdoorTemp",
      mode: "simulation",
      simulation_value: 42.5
    )

    expect(measurement).to be_valid
    expect(measurement.trace_value).to eq(42.5)
  end

  it "allows acquisition measurements without hardware and traces nil without a sample" do
    measurement = described_class.create!(logic_diagram: diagram, name: "FutureSensor")

    expect(measurement.trace_value).to be_nil
  end

end
