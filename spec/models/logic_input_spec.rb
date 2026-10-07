require "rails_helper"

RSpec.describe LogicInput, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "is a typed, expression-safe port scoped to a diagram" do
    described_class.create!(logic_diagram: diagram, name: "OutdoorTemp", value_type: "number", units: "°C")

    expect(described_class.new(logic_diagram: diagram, name: "OutdoorTemp")).not_to be_valid
    expect(described_class.new(logic_diagram: diagram, name: "Outdoor Temp")).not_to be_valid
    expect(described_class.new(logic_diagram: diagram, name: "Switch", value_type: "text")).not_to be_valid
  end

  it "contains no real-world binding fields" do
    expect(described_class.column_names).not_to include("device_id", "source_path", "mode", "simulation_value")
  end
end
