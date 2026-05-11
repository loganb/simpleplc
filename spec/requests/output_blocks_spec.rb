require "rails_helper"

RSpec.describe "Output blocks API", type: :request do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:host) { HostInterface.create!(port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay board", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 3) }

  it "creates and lists output blocks" do
    post "/output_blocks", params: {
      output_block: {
        logic_diagram_id: diagram.id,
        name: "Boiler_Enable",
        device_id: device.id,
        channel: 1,
        input_expression: "true",
        output_enable: true
      }
    }

    expect(response).to have_http_status(:created)

    output = OutputBlock.find(response.parsed_body.fetch("id"))
    trace = Trace.create!(logic_diagram: diagram)
    output.data.create!(
      trace: trace,
      value: 1.0,
      state: {
        desired_output: true,
        effective_output: nil,
        diagram_output_enable: false,
        output_enable: true,
        write_pending: false,
        write_skipped_reason: "diagram_output_disabled"
      },
      input_values: { input: true },
      recorded_at: Time.zone.parse("2026-04-29 10:00:00")
    )

    get "/output_blocks", params: { logic_diagram_id: diagram.id }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("output_blocks").first).to include(
      "name" => "Boiler_Enable",
      "logic_diagram_id" => diagram.id,
      "device_id" => device.id,
      "channel" => 1,
      "input_expression" => "true",
      "output_enable" => true,
      "desired_output" => true,
      "effective_output" => nil,
      "write_pending" => false
    )
  end
end
