require "rails_helper"

RSpec.describe LogicOutput, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "accepts expressions over diagram inputs and upstream blocks" do
    LogicInput.create!(logic_diagram: diagram, name: "Heat_Call", value_type: "boolean")
    output = described_class.new(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      value_type: "boolean",
      input_expression: "Heat_Call"
    )

    expect(output).to be_valid
  end

  it "rejects unknown names and contains no hardware fields" do
    output = described_class.new(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      value_type: "boolean",
      input_expression: "Missing_Call"
    )

    expect(output).not_to be_valid
    expect(output.errors[:input_expression].join).to include("unknown name Missing_Call")
    expect(described_class.column_names).not_to include("device_id", "channel", "output_enable")
  end
end
