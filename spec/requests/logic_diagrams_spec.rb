require "rails_helper"

RSpec.describe "Logic diagrams API", type: :request do
  it "creates and lists diagrams using the flat RestfulApi wire format" do
    post "/logic_diagrams", params: { logic_diagram: { name: "Boiler", update_period: 45, output_enable: true } }

    expect(response).to have_http_status(:created)
    id = response.parsed_body.fetch("id")
    Measurement.create!(
      logic_diagram_id: id,
      name: "SimTemp",
      mode: "simulation",
      simulation_value: 10.0
    )

    get "/logic_diagrams"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("query")).to include(id)
    expect(response.parsed_body.fetch("logic_diagrams").first).to include(
      "name" => "Boiler",
      "update_period" => 45,
      "output_enable" => true
    )
    expect(response.parsed_body.fetch("measurements").first).to include(
      "logic_diagram_id" => id,
      "name" => "SimTemp",
      "mode" => "simulation",
      "simulation_value" => 10.0
    )
  end

  it "deletes a diagram and its dependent records" do
    diagram = LogicDiagram.create!(name: "Boiler")
    host = HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0")
    device = Device.create!(
      name: "Relay board",
      host_interface: host,
      driver: "Drivers::N4D8B08",
      modbus_address: 3
    )

    Measurement.create!(
      logic_diagram: diagram,
      name: "Temp",
      mode: "simulation",
      simulation_value: 70.0
    )
    HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Heat_Call",
      stratum: 1,
      input_expressions: {
        "value" => "Temp",
        "low_limit" => "68",
        "high_limit" => "72"
      },
      config: { "mode" => "active_high" }
    )
    OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "Heat_Call"
    )
    Trace.create!(logic_diagram: diagram, recorded_at: Time.zone.parse("2026-05-11 10:00:00"))

    expect do
      delete "/logic_diagrams/#{diagram.id}"
    end.to change(LogicDiagram, :count).by(-1)
      .and change(Measurement, :count).by(-1)
      .and change(LogicBlock, :count).by(-1)
      .and change(OutputBlock, :count).by(-1)
      .and change(Trace, :count).by(-1)

    expect(response).to have_http_status(:no_content)
  end
end
