require "rails_helper"

RSpec.describe "Measurements API", type: :request do
  it "creates simulation measurements scoped to a logic diagram" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/measurements", params: {
      measurement: {
        logic_diagram_id: diagram.id,
        name: "OutdoorTemp",
        mode: "simulation",
        simulation_value: 41.5
      }
    }

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("measurements").first).to include(
      "logic_diagram_id" => diagram.id,
      "name" => "OutdoorTemp",
      "mode" => "simulation",
      "simulation_value" => 41.5
    )
  end
end
