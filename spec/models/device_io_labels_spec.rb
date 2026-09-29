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

  it "advances the device edit revision without advancing the parent bus revision" do
    device
    device_revision = device.configuration_revision
    bus_revision = interface.reload.configuration_revision

    device.update!(io_labels: { outputs: { "1" => "Fan" } })

    expect(device.configuration_revision).to eq(device_revision + 1)
    expect(interface.reload.configuration_revision).to eq(bus_revision)
  end

  it "does not change LogicDiagram hardware identities when labels are renamed" do
    diagram = LogicDiagram.create!(name: "Boiler", update_period: 60)
    measurement = Measurement.create!(
      logic_diagram: diagram,
      device: device,
      name: "Call",
      mode: "acquisition",
      source_path: "inputs[0]"
    )
    output = OutputBlock.create!(
      logic_diagram: diagram,
      device: device,
      name: "Fan",
      channel: 1,
      input_expression: "Call"
    )

    device.update!(io_labels: { inputs: { "inputs[0]" => "Boiler call" }, outputs: { "1" => "Supply fan" } })

    expect(measurement.reload.source_path).to eq("inputs[0]")
    expect(output.reload.channel).to eq(1)
  end
end
