require "rails_helper"

RSpec.describe "Logic diagrams API", type: :request do
  it "creates and lists hardware-independent definitions" do
    post "/logic_diagrams", params: { logic_diagram: { name: "Boiler" } }

    expect(response).to have_http_status(:created)
    id = response.parsed_body.fetch("id")
    LogicInput.create!(logic_diagram_id: id, name: "RoomTemp", value_type: "number", units: "°C")

    get "/logic_diagrams"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("query")).to include(id)
    expect(response.parsed_body.fetch("logic_diagrams").first).to include("name" => "Boiler")
    expect(response.parsed_body.fetch("logic_diagrams").first).not_to have_key("update_period")
    expect(response.parsed_body.fetch("logic_inputs").first).to include(
      "logic_diagram_id" => id,
      "name" => "RoomTemp",
      "value_type" => "number"
    )
  end

  it "deletes a diagram and all definition and instance records" do
    diagram = LogicDiagram.create!(name: "Boiler")
    input = LogicInput.create!(logic_diagram: diagram, name: "Temp")
    HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Heat_Call",
      stratum: 1,
      input_expressions: { "value" => "Temp", "low_limit" => "68", "high_limit" => "72" },
      config: { "mode" => "active_high" }
    )
    LogicOutput.create!(logic_diagram: diagram, name: "Boiler_Enable", value_type: "boolean", input_expression: "Heat_Call")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Boiler room")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 70)
    Trace.create!(logic_instance: instance)

    expect do
      delete "/logic_diagrams/#{diagram.id}"
    end.to change(LogicDiagram, :count).by(-1)
      .and change(LogicInput, :count).by(-1)
      .and change(LogicBlock, :count).by(-1)
      .and change(LogicOutput, :count).by(-1)
      .and change(LogicInstance, :count).by(-1)
      .and change(Trace, :count).by(-1)

    expect(response).to have_http_status(:no_content)
  end
end
