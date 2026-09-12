require "rails_helper"

RSpec.describe Measurement, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "requires expression-safe unique names" do
    measurement = described_class.new(logic_diagram: diagram, name: "DHW Temp")

    expect(measurement).not_to be_valid
    expect(measurement.errors[:name].join).to include("expression-safe identifier")
  end

  it "scopes names to a logic diagram" do
    other = LogicDiagram.create!(name: "Other")
    described_class.create!(logic_diagram: diagram, name: "DHW_Temp")

    expect(described_class.new(logic_diagram: diagram, name: "DHW_Temp")).not_to be_valid
    expect(described_class.new(logic_diagram: other, name: "DHW_Temp")).to be_valid
  end

  it "allows simulation measurements without hardware" do
    measurement = described_class.new(
      logic_diagram: diagram,
      name: "OutdoorTemp",
      mode: "simulation",
      simulation_value: 42.5
    )

    expect(measurement).to be_valid
    expect(measurement.trace_value).to eq(42.5)
  end

  it "allows acquisition measurements without hardware and traces nil without a sample" do
    measurement = described_class.create!(logic_diagram: diagram, name: "FutureSensor")

    expect(measurement.trace_value).to be_nil
  end

  it "extracts acquisition values from device current_state data" do
    host = HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0")
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
    first = described_class.create!(logic_diagram: diagram, name: "FirstFloorHeatCall", device: device, source_path: "inputs[0]")
    second = described_class.create!(logic_diagram: diagram, name: "SecondFloorHeatCall", device: device, source_path: "inputs[1]")

    expect(first.trace_value).to eq(0.0)
    expect(second.trace_value).to eq(1.0)
  end

  it "extracts numeric acquisition values from nested source paths" do
    host = HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0")
    device = Device.create!(
      name: "Temp board",
      host_interface: host,
      driver: "Drivers::N4DSC08",
      modbus_address: 1,
      current_state: {
        "status" => "ok",
        "data" => {
          "temperatures" => [ nil, 22.4 ]
        }
      }
    )
    measurement = described_class.create!(logic_diagram: diagram, name: "SupplyTemp", device: device, source_path: "temperatures[1]")

    expect(measurement.trace_value).to eq(22.4)
  end
end
