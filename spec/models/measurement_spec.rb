require "rails_helper"

RSpec.describe Measurement do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:instance) { LogicInstance.create!(name: "Room", logic_diagram: diagram) }
  let(:input) { LogicInput.create!(logic_diagram: diagram, name: "Temperature", value_type: "number") }

  it "validates the attachment tuple and its diagram" do
    expect(Measurement.new(name: "Room temperature")).to be_valid
    expect(Measurement.new(name: "Partial", logic_instance: instance)).not_to be_valid
    expect(Measurement.new(name: "Attached", logic_instance: instance, source: input)).to be_valid
    other = LogicInstance.create!(name: "Other", logic_diagram: LogicDiagram.create!(name: "Other diagram"))
    expect(Measurement.new(name: "Wrong", logic_instance: other, source: input)).not_to be_valid
    expect(Measurement.new(name: "Unsafe", logic_instance: instance, source_type: "Device", source_id: 1)).not_to be_valid
  end

  it "records immutable samples and detaches on source deletion" do
    measurement = Measurement.create!(name: "Temperature history", logic_instance: instance, source: input)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.sole.snapshot).to include("value" => nil, "source_name" => "Temperature")
    input.destroy!
    expect(measurement.reload.attributes.values_at("logic_instance_id", "source_type", "source_id")).to eq([ nil, nil, nil ])
    expect(measurement.measurement_samples.count).to eq(1)
  end
end

RSpec.describe "Measurement lifecycle" do
  let(:diagram) { LogicDiagram.create!(name: "Diagram") }
  let(:instance) { LogicInstance.create!(name: "Instance", logic_diagram: diagram) }
  let(:input) { LogicInput.create!(logic_diagram: diagram, name: "Input") }
  let!(:measurement) { Measurement.create!(name: "History", logic_instance: instance, source: input) }

  it "detaches when the source moves diagrams" do
    input.update!(logic_diagram: LogicDiagram.create!(name: "Other"))
    expect(measurement.reload.logic_instance_id).to be_nil
  end

  it "detaches when the instance changes diagrams or is deleted" do
    instance.update!(logic_diagram: LogicDiagram.create!(name: "Other"))
    expect(measurement.reload.source_id).to be_nil
    measurement.update!(logic_instance: instance, source: LogicInput.create!(logic_diagram: instance.logic_diagram, name: "New"))
    instance.destroy!
    expect(measurement.reload.logic_instance_id).to be_nil
  end

  it "rolls samples back with a failed trace insert" do
    allow_any_instance_of(Trace).to receive(:_create_record).and_raise(ActiveRecord::RecordNotSaved)
    expect { Trace.create!(logic_instance: instance) }.to raise_error(ActiveRecord::RecordNotSaved)
    expect(measurement.measurement_samples.count).to eq(0)
    expect(instance.reload.logic_instance_state).to be_nil
  end

  it "preserves snapshots through rename, detach, cross-type reassignment and diagram deletion" do
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 0)
    Trace.create!(logic_instance: instance)
    first = measurement.measurement_samples.sole
    expect(first.snapshot).to include("value" => 0.0, "source_name" => "Input", "value_type" => "number")
    input.update!(name: "Renamed")
    measurement.update!(logic_instance: nil, source: nil)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.count).to eq(1)
    output = LogicOutput.create!(logic_diagram: diagram, name: "Command", value_type: "boolean", input_expression: "false")
    measurement.update!(logic_instance: instance, source: output)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.order(:id).last.snapshot).to include("value" => false, "value_type" => "boolean", "source_type" => "LogicOutput")
    expect(first.reload.snapshot.fetch("source_name")).to eq("Input")
    diagram.destroy!
    expect(measurement.reload.source).to be_nil
    expect(measurement.measurement_samples.count).to eq(2)
  end

  it "samples multiple probes of the same port only for their attached instance" do
    duplicate = Measurement.create!(name: "Second probe", logic_instance: instance, source: input)
    other = LogicInstance.create!(name: "Other instance", logic_diagram: diagram)
    Trace.create!(logic_instance: other)
    expect(MeasurementSample.count).to eq(0)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.count).to eq(1)
    expect(duplicate.measurement_samples.count).to eq(1)
  end
end

RSpec.describe "Measurement evaluation" do
  it "records computed booleans independently of physical output enable and preserves snapshots" do
    diagram = LogicDiagram.create!(name: "System")
    input = LogicInput.create!(logic_diagram: diagram, name: "Switch", value_type: "boolean")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Enabled", value_type: "boolean", input_expression: "Switch")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Zone", output_enable: false)
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: false)
    first = Measurement.create!(name: "First", logic_instance: instance, source: output)
    second = Measurement.create!(name: "Second", logic_instance: instance, source: output)
    Trace.create!(logic_instance: instance)
    output.update!(name: "Renamed")
    expect(first.measurement_samples.sole.snapshot).to include("value" => false, "source_name" => "Enabled")
    expect(second.measurement_samples.sole.snapshot["value"]).to eq(false)
  end

  it "enforces the full tuple in the database even when validations are bypassed" do
    instance = LogicInstance.create!(logic_diagram: LogicDiagram.create!(name: "System"), name: "Zone")
    expect {
      Measurement.insert_all!([ { name: "Partial", logic_instance_id: instance.id, source_id: 1 } ])
    }.to raise_error(ActiveRecord::StatementInvalid)
  end
end
