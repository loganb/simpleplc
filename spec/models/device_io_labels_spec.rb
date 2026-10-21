require "rails_helper"

RSpec.describe Device do
  let(:interface) { HostInterface.create!(name: "Relay Bus", port: "/dev/missing") }
  let(:device) do
    Device.create!(
      host_interface: interface,
      name: "Relay board",
      driver: "Drivers::N4D8B08",
      modbus_address: 1
    )
  end

  it "uses driver labels by default and merges stored overrides by stable identity" do
    expect(device.inputs.first[:label]).to eq("Input 1")
    expect(device.outputs.first[:label]).to eq("Relay 1")

    device.update!(io_labels: {
      inputs: { "inputs[0]" => " Boiler enable ", "inputs[1]" => "", "unknown" => "Ignored" },
      outputs: { "1" => "Supply fan", "99" => "Ignored" }
    })

    expect(device.io_labels).to eq(
      "inputs" => { "inputs[0]" => "Boiler enable" },
      "outputs" => { "1" => "Supply fan" }
    )
    expect(device.inputs.first).to include(path: "inputs[0]", label: "Boiler enable")
    expect(device.inputs.second[:label]).to eq("Input 2")
    expect(device.outputs.first).to include(channel: 1, label: "Supply fan")
    expect(device.outputs.second[:label]).to eq("Relay 2")
  end

  it "rejects malformed and overlong label data" do
    device.io_labels = { inputs: [ "not a map" ] }
    expect(device).not_to be_valid
    expect(device.errors[:io_labels]).not_to be_empty

    device.io_labels = { outputs: { "1" => "x" * 101 } }
    expect(device).not_to be_valid
    expect(device.errors[:io_labels]).not_to be_empty
  end

  it "discards overrides that do not belong to a changed driver" do
    device.update!(io_labels: { inputs: { "inputs[0]" => "Switch" }, outputs: { "1" => "Fan" } })

    device.update!(driver: "Drivers::N4DSC08")

    expect(device.io_labels).to eq({})
    expect(device.inputs.first[:label]).to eq("Temperature 1")
    expect(device.outputs).to be_empty
  end

  it "does not change LogicDiagram hardware identities when labels are renamed" do
    diagram = LogicDiagram.create!(name: "Boiler")
    input = LogicInput.create!(logic_diagram: diagram, name: "Call", value_type: "boolean")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Fan", value_type: "boolean", input_expression: "Call")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Boiler room")
    input_binding = LogicInputBinding.create!(
      logic_instance: instance, logic_input: input, device: device,
      source_kind: "device_input", source_path: "inputs[0]"
    )
    output_binding = LogicOutputBinding.create!(
      logic_instance: instance, logic_output: output, device: device, channel: 1
    )

    device.update!(io_labels: { inputs: { "inputs[0]" => "Boiler call" }, outputs: { "1" => "Supply fan" } })

    expect(input_binding.reload.source_path).to eq("inputs[0]")
    expect(output_binding.reload.channel).to eq(1)
  end

  describe "settings" do
    it "defaults to empty and accepts settings the driver defines" do
      wj150 = Device.create!(host_interface: interface, name: "Flow", driver: "Drivers::WJ150", modbus_address: 2)
      expect(wj150.settings).to eq({})
      expect(wj150.update(settings: { "address" => 9 })).to be(true)
      expect(wj150.update(settings: { "address" => 0 })).to be(false)
      expect(wj150.errors[:settings].first).to match(/between 1 and 247/)
    end

    it "rejects settings the driver does not define" do
      expect(device.update(settings: { "address" => 9 })).to be(false)
      expect(device.errors[:settings].first).to match(/unknown setting address/)
    end
  end
end
