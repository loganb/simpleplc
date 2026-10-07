require "rails_helper"

RSpec.describe LogicInstance, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Temperature Control") }
  let(:other_diagram) { LogicDiagram.create!(name: "Other") }

  it "owns runtime configuration and defaults outputs off" do
    instance = described_class.create!(logic_diagram: diagram, name: "Zone 1", update_period: 30)

    expect(instance).not_to be_output_enable
    expect(instance.update_period).to eq(30)
    expect(described_class.new(logic_diagram: diagram, name: "Bad", update_period: 0)).not_to be_valid
  end

  it "clears bindings and traces when its selected diagram changes" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint")
    instance = described_class.create!(logic_diagram: diagram, name: "Zone 1")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 68)
    Trace.create!(logic_instance: instance)

    expect { instance.update!(logic_diagram: other_diagram) }
      .to change(LogicInputBinding, :count).by(-1)
      .and change(Trace, :count).by(-1)
  end
end
