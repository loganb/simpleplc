require "rails_helper"

RSpec.describe "Traces API", type: :request do
  it "creates a trace and returns computed results" do
    diagram = LogicDiagram.create!(name: "Boiler")
    input = LogicInput.create!(logic_diagram: diagram, name: "Temp")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Boiler room")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 10.0)

    post "/traces", params: { trace: { logic_instance_id: instance.id } }

    expect(response).to have_http_status(:created)
    trace_id = response.parsed_body.fetch("id")
    expect(response.parsed_body).not_to have_key("data")
    trace = response.parsed_body.fetch("traces").find { |candidate| candidate.fetch("id") == trace_id }
    expect(trace.fetch("results").fetch("logic_inputs").fetch(input.id.to_s)).to include(
      "id" => input.id,
      "name" => "Temp",
      "value" => 10.0
    )
  end
end
