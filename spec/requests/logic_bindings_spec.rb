require "rails_helper"

RSpec.describe "Logic bindings API", type: :request do
  let(:diagram) { LogicDiagram.create!(name: "Control") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Zone 1") }
  let(:host) { HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1) }

  it "creates a fixed input binding" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint")

    post "/logic_input_bindings", params: {
      logic_input_binding: {
        logic_instance_id: instance.id,
        logic_input_id: input.id,
        source_kind: "fixed_value",
        fixed_value: 68
      }
    }, as: :json

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("logic_input_bindings").first).to include(
      "logic_instance_id" => instance.id,
      "logic_input_id" => input.id,
      "source_kind" => "fixed_value",
      "fixed_value" => 68
    )
  end

  it "creates a device output binding" do
    output = LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "true")

    post "/logic_output_bindings", params: {
      logic_output_binding: {
        logic_instance_id: instance.id,
        logic_output_id: output.id,
        device_id: device.id,
        channel: 1,
        output_enable: true
      }
    }

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("logic_output_bindings").first).to include(
      "logic_output_id" => output.id,
      "device_id" => device.id,
      "channel" => 1,
      "output_enable" => true
    )
  end
end
