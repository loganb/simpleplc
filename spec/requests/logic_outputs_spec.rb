require "rails_helper"

RSpec.describe "Logic outputs API", type: :request do
  it "creates definition-only outputs" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/logic_outputs", params: {
      logic_output: {
        logic_diagram_id: diagram.id,
        name: "Boiler_Enable",
        value_type: "boolean",
        input_expression: "true"
      }
    }

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("logic_outputs").first).to include(
      "logic_diagram_id" => diagram.id,
      "name" => "Boiler_Enable",
      "value_type" => "boolean",
      "input_expression" => "true"
    )
  end
end
