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

    measurement_result = trace.result_for(Measurement.find_by!(name: "BoilerOutletTemp"))
    block_result = trace.result_for(block)
    expect(measurement_result["value"]).to eq(145.0)
    expect(block_result["input_values"]).to include("value" => 145.0)
    expect(block_result["value"]).to eq(1.0)
    expect(trace.results).to include(
      "schema_version" => 1,
      "measurements" => include(Measurement.find_by!(name: "BoilerOutletTemp").id.to_s),
      "logic_blocks" => include(block.id.to_s),
      "output_blocks" => {}
    )
  end

  it "snapshots acquisition measurements from device current_state" do
    host = HostInterface.create!(port: "/dev/ttyUSB0")
    device = Device.create!(
      name: "Relay board",
      host_interface: host,
      driver: "Drivers::N4D8B08",
      modbus_address: 3,
      current_state: {
        "status" => "ok",
        "data" => {
          "inputs" => [ false, true ]
        }
      }
    )
    measurement = Measurement.create!(logic_diagram: diagram, name: "Heat_Call", device: device, source_path: "inputs[1]")

    trace = Trace.create!(logic_diagram: diagram)

    expect(trace.result_for(measurement)["value"]).to eq(1.0)
  end

  it "records nil for acquisition measurements without samples" do
    measurement = Measurement.create!(logic_diagram: diagram, name: "FutureSensor")

    trace = Trace.create!(logic_diagram: diagram)

    expect(trace.result_for(measurement)["value"]).to be_nil
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

    expect(trace.result_for(block)["input_values"]).to include("value" => 10.0)
  end

  it "evaluates outputs after measurements and blocks" do
    Measurement.create!(logic_diagram: diagram, name: "Heat_Call", mode: "simulation", simulation_value: 1.0)
    host = HostInterface.create!(port: "/dev/ttyUSB0")
    device = Device.create!(name: "Relay board", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 3)
    output = OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "Heat_Call",
      output_enable: false
    )

    trace = Trace.create!(logic_diagram: diagram)

    output_result = trace.result_for(output)
    expect(output_result["value"]).to eq(1.0)
    expect(output_result["input_values"]).to include("input" => 1.0)
    expect(output_result["state"]).to include(
      "desired_output" => true,
      "write_pending" => false,
      "write_skipped_reason" => "diagram_output_disabled"
    )
  end

  it "stores null expression results in trace JSON while preserving retained block state" do
    Measurement.create!(logic_diagram: diagram, name: "FutureSensor")
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Ready",
      stratum: 1,
      input_expressions: { "value" => "FutureSensor", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )
    Trace.create!(logic_diagram: diagram, recorded_at: 1.minute.ago).tap do |previous_trace|
      previous_trace.update!(
        results: Trace.empty_results.merge(
          "logic_blocks" => {
            block.id.to_s => {
              "id" => block.id,
              "name" => block.name,
              "type" => block.type,
              "value" => 1.0,
              "state" => { "output" => true },
              "input_values" => {},
              "recorded_at" => previous_trace.recorded_at.iso8601
            }
          }
        )
      )
    end
    host = HostInterface.create!(port: "/dev/ttyUSB0")
    device = Device.create!(name: "Relay board", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 3)
    output = OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "Ready",
      output_enable: true
    )

    trace = Trace.create!(logic_diagram: diagram)

    block_result = trace.result_for(block)
    output_result = trace.result_for(output)
    expect(block_result["value"]).to be_nil
    expect(block_result["state"]).to include("output" => true)
    expect(block_result["input_values"]).to include("value" => nil)
    expect(output_result["input_values"]).to include("input" => nil)
    expect(output_result["state"]).to include("write_pending" => false)
  end
end
