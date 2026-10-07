require "rails_helper"

RSpec.describe Logic::OutputEvaluator do
  it "records desired output and instance/binding gate state" do
    diagram = LogicDiagram.create!(name: "Boiler")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "true")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Boiler room", output_enable: true)
    host = HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0")
    device = Device.create!(name: "Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1)
    binding = LogicOutputBinding.create!(logic_instance: instance, logic_output: output, device: device, channel: 1)
    trace = Trace.create!(logic_instance: instance)

    result = trace.result_for(output)

    expect(result["value"]).to eq(true)
    expect(result["state"]).to include(
      "binding_id" => binding.id,
      "instance_output_enable" => true,
      "output_enable" => true,
      "effective_output" => true,
      "write_pending" => true
    )
  end

  it "normalizes boolean expressions to the declared numeric output type" do
    diagram = LogicDiagram.create!(name: "Numeric output")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Demand", value_type: "number", input_expression: "true")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Numeric room")

    trace = Trace.create!(logic_instance: instance)

    expect(trace.value_for(output)).to eq(1.0)
  end

  it "records why an output cannot write" do
    diagram = LogicDiagram.create!(name: "Gated output")
    input = LogicInput.create!(logic_diagram: diagram, name: "Demand")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "Demand > 0")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Gated room", output_enable: false)
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 1)

    unbound = Trace.create!(logic_instance: instance).result_for(output)
    expect(unbound["state"]).to include(
      "desired_output" => true,
      "effective_output" => nil,
      "write_pending" => false,
      "write_skipped_reason" => "output_unbound"
    )

    host = HostInterface.create!(name: "Gate Bus", port: "/dev/ttyUSB1")
    device = Device.create!(name: "Gate Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1)
    binding = LogicOutputBinding.create!(logic_instance: instance, logic_output: output, device: device, channel: 1)
    master_disabled = Trace.create!(logic_instance: instance).result_for(output)
    expect(master_disabled["state"]["write_skipped_reason"]).to eq("instance_output_disabled")

    instance.update!(output_enable: true)
    binding.update!(output_enable: false)
    binding_disabled = Trace.create!(logic_instance: instance).result_for(output)
    expect(binding_disabled["state"]["write_skipped_reason"]).to eq("output_disabled")
  end

  it "propagates an unknown output value without scheduling a write" do
    diagram = LogicDiagram.create!(name: "Unknown output")
    input = LogicInput.create!(logic_diagram: diagram, name: "FutureSensor")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "FutureSensor > 0")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Unknown room", output_enable: true)

    result = Trace.create!(logic_instance: instance).result_for(output)

    expect(result["value"]).to be_nil
    expect(result["input_values"]).to include("input" => nil)
    expect(result["state"]).to include(
      "desired_output" => nil,
      "effective_output" => nil,
      "write_pending" => false,
      "write_skipped_reason" => "output_unknown"
    )
  end
end
