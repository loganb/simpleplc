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

  it "clears bindings, traces, rollups and live state when its selected diagram changes" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint")
    instance = described_class.create!(logic_diagram: diagram, name: "Zone 1")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 68)
    Trace.create!(logic_instance: instance)
    TraceRollup.create!(logic_instance: instance, bucket_start: 1.hour.ago.beginning_of_minute, sample_count: 1)

    expect { instance.update!(logic_diagram: other_diagram) }
      .to change(LogicInputBinding, :count).by(-1)
      .and change(Trace, :count).by(-1)
      .and change(TraceRollup, :count).by(-1)
      .and change(LogicInstanceState, :count).by(-1)
    expect(instance.result_for(LogicInput.create!(logic_diagram: other_diagram, name: "Fresh"))).to be_nil
  end

  it "reads results from its state row" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint")
    instance = described_class.create!(logic_diagram: diagram, name: "Zone 1")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 68)
    expect(instance.result_for(input)).to be_nil

    Trace.create!(logic_instance: instance)

    expect(instance.reload.result_for(input)).to include("value" => 68.0)
  end
end
