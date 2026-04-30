require "rails_helper"

RSpec.describe Logic::TraceEvaluator do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "snapshots measurements before evaluating blocks" do
    Measurement.create!(
      logic_diagram: diagram,
      name: "BoilerOutletTemp",
      mode: "simulation",
      simulation_value: 145.0
    )
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "BOT_Ready",
      stratum: 1,
      input_expressions: { "value" => "BoilerOutletTemp", "low_limit" => "130", "high_limit" => "140" },
      config: { "mode" => "active_high" }
    )

    trace = Trace.create!(logic_diagram: diagram)

    measurement_datum = trace.data.find_by!(source_type: "Measurement")
    block_datum = trace.data.find_by!(source: block)
    expect(measurement_datum.value).to eq(145.0)
    expect(measurement_datum.id).to be < block_datum.id
    expect(block_datum.input_values).to include("value" => 145.0)
    expect(block_datum.value).to eq(1.0)
  end

  it "uses latest acquisition sample without polling immediately" do
    measurement = Measurement.create!(logic_diagram: diagram, name: "DHW_Temp")
    measurement.measurement_data.create!(value: 138.0, recorded_at: 5.minutes.ago)

    trace = Trace.create!(logic_diagram: diagram)

    expect(trace.data.find_by!(source: measurement).value).to eq(138.0)
  end

  it "records nil for acquisition measurements without samples" do
    measurement = Measurement.create!(logic_diagram: diagram, name: "FutureSensor")

    trace = Trace.create!(logic_diagram: diagram)

    expect(trace.data.find_by!(source: measurement).value).to be_nil
  end

  it "keeps references scoped to a diagram" do
    other = LogicDiagram.create!(name: "Other")
    Measurement.create!(logic_diagram: other, name: "SharedName", mode: "simulation", simulation_value: 999.0)
    Measurement.create!(logic_diagram: diagram, name: "SharedName", mode: "simulation", simulation_value: 10.0)
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Ready",
      stratum: 1,
      input_expressions: { "value" => "SharedName", "low_limit" => "0", "high_limit" => "20" },
      config: {}
    )

    trace = Trace.create!(logic_diagram: diagram)

    expect(trace.data.find_by!(source: block).input_values).to include("value" => 10.0)
  end
end
