require "rails_helper"

RSpec.describe Measurement do
  let(:diagram) { LogicDiagram.create!(name: "Measured diagram") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Measured instance") }
  let(:input) { LogicInput.create!(logic_diagram: diagram, name: "Temperature", value_type: "number") }
  let(:output) do
    input
    LogicOutput.create!(logic_diagram: diagram, name: "Demand", value_type: "boolean", input_expression: "Temperature > 20")
  end

  def measured(name, **source)
    described_class.create!(name: name).tap { |measurement| MeasurementSource.create!(measurement: measurement, **source) }
  end

  it "records evaluated input and computed output values even when the output is unbound and disabled" do
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 22)
    input_measurement = measured("Room temperature", logic_instance: instance, logic_input: input)
    output_measurement = measured("Demand history", logic_instance: instance, logic_output: output)

    Trace.create!(logic_instance: instance, recorded_at: Time.utc(2026, 10, 21, 12))

    expect(input_measurement.measurement_samples.pluck(:value)).to eq([ 22.0 ])
    expect(output_measurement.measurement_samples.pluck(:value)).to eq([ true ])
    expect(instance).not_to be_output_enable
    expect(instance.logic_output_bindings).to be_empty
  end

  it "keeps old values across detach and reattachment and stops sampling while detached" do
    measurement = measured("Probe", logic_instance: instance, logic_input: input)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.pluck(:value)).to eq([ nil ])

    measurement.measurement_source.destroy!
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.count).to eq(1)

    MeasurementSource.create!(measurement: measurement, logic_instance: instance, logic_output: output)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.order(:id).pluck(:value)).to eq([ nil, nil ])
  end

  it "rejects ports from another diagram and incomplete sources" do
    other = LogicDiagram.create!(name: "Other diagram")
    other_input = LogicInput.create!(logic_diagram: other, name: "OtherInput")
    measurement = described_class.create!(name: "Probe")
    expect(MeasurementSource.new(measurement: measurement, logic_instance: instance, logic_input: other_input)).not_to be_valid
    expect(MeasurementSource.new(measurement: measurement, logic_instance: instance)).not_to be_valid
    expect(MeasurementSource.new(measurement: measurement, logic_instance: instance, logic_input: input, logic_output: output)).not_to be_valid
  end

  it "detaches on source deletion and retains its history" do
    measurement = measured("Probe", logic_instance: instance, logic_input: input)
    Trace.create!(logic_instance: instance)
    input.destroy!

    expect(measurement.reload.measurement_source).to be_nil
    expect(measurement.measurement_samples.count).to eq(1)
  end

  it "detaches when the instance switches diagrams or is removed" do
    measurement = measured("Probe", logic_instance: instance, logic_output: output)
    Trace.create!(logic_instance: instance)
    other = LogicDiagram.create!(name: "Replacement")

    instance.update!(logic_diagram: other)
    expect(measurement.reload.measurement_source).to be_nil
    expect(measurement.measurement_samples.count).to eq(1)

    MeasurementSource.create!(measurement: measurement, logic_instance: instance,
      logic_input: LogicInput.create!(logic_diagram: other, name: "ReplacementInput"))
    instance.destroy!
    expect(measurement.reload.measurement_source).to be_nil
    expect(measurement.measurement_samples.count).to eq(1)
  end

  it "does not retain a sample when the evaluation fails" do
    measurement = measured("Probe", logic_instance: instance, logic_output: output)
    allow(Logic::OutputEvaluator).to receive(:evaluate!).and_raise("calculation failed")

    expect { Trace.create!(logic_instance: instance) }.to raise_error("calculation failed")
    expect(measurement.measurement_samples.count).to eq(0)
  end

  it "rolls back the trace and live state if recording a sample fails" do
    measured("Probe", logic_instance: instance, logic_input: input)
    allow(MeasurementSample).to receive(:insert_all!).and_raise("sample write failed")

    expect { Trace.create!(logic_instance: instance) }.to raise_error("sample write failed")
    expect(instance.traces.count).to eq(0)
    expect(instance.reload.logic_instance_state).to be_nil
  end
end
