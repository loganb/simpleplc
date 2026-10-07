require "rails_helper"

RSpec.describe "Logic inputs API", type: :request do
  it "creates typed inputs scoped to a diagram" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/logic_inputs", params: {
      logic_input: {
        logic_diagram_id: diagram.id,
        name: "OutdoorTemp",
        value_type: "number",
        units: "°C"
      }
    }

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("logic_inputs").first).to include(
      "logic_diagram_id" => diagram.id,
      "name" => "OutdoorTemp",
      "value_type" => "number",
      "units" => "°C"
    )
  end
end
