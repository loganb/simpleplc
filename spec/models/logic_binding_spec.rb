require "rails_helper"

RSpec.describe "Logic instance bindings", type: :model do
  let(:host) { HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1) }
  let(:diagram) { LogicDiagram.create!(name: "Control") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Zone 1") }

  it "reads compatible device inputs and preserves number coercion" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Call", value_type: "number")
    device.update!(current_state: { "data" => { "inputs" => [ true ] } })
    binding = LogicInputBinding.create!(
      logic_instance: instance,
      logic_input: input,
      source_kind: "device_input",
      device: device,
      source_path: "inputs[0]"
    )

    expect(binding.trace_value).to eq(1.0)
  end

  it "validates fixed values against the logical input type" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint", value_type: "number")

    expect(LogicInputBinding.new(
      logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: true
    )).not_to be_valid
  end

  it "rejects ports from another diagram" do
    other = LogicDiagram.create!(name: "Other")
    input = LogicInput.create!(logic_diagram: other, name: "Setpoint")
    binding = LogicInputBinding.new(
      logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 68
    )

    expect(binding).not_to be_valid
    expect(binding.errors[:logic_input].join).to include("instance's diagram")
  end

  it "allows inactive instances to share a physical output but rejects a second active owner" do
    output = LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "true")
    instance.update!(output_enable: true)
    LogicOutputBinding.create!(
      logic_instance: instance, logic_output: output, device: device, channel: 1
    )
    other_instance = LogicInstance.create!(logic_diagram: diagram, name: "Zone 2")

    LogicOutputBinding.create!(
      logic_instance: other_instance, logic_output: output, device: device, channel: 1
    )

    expect(other_instance.update(output_enable: true)).to be(false)
    expect(other_instance.errors[:output_enable].join).to include("already controlled")

    third_instance = LogicInstance.create!(logic_diagram: diagram, name: "Zone 3", output_enable: true)
    conflicting_binding = LogicOutputBinding.new(
      logic_instance: third_instance, logic_output: output, device: device, channel: 1
    )
    expect(conflicting_binding).not_to be_valid
    expect(conflicting_binding.errors[:channel].join).to include("already controlled")
  end
end
