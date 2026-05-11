require "rails_helper"

RSpec.describe "Traces API", type: :request do
  it "creates a trace and returns computed results" do
    diagram = LogicDiagram.create!(name: "Boiler")
    measurement = Measurement.create!(
      logic_diagram: diagram,
      name: "Temp",
      mode: "simulation",
      simulation_value: 10.0
    )

    post "/traces", params: { trace: { logic_diagram_id: diagram.id } }

    expect(response).to have_http_status(:created)
    trace_id = response.parsed_body.fetch("id")
    expect(response.parsed_body).not_to have_key("data")
    trace = response.parsed_body.fetch("traces").find { |candidate| candidate.fetch("id") == trace_id }
    expect(trace.fetch("results").fetch("measurements").fetch(measurement.id.to_s)).to include(
      "id" => measurement.id,
      "name" => "Temp",
      "value" => 10.0
    )
  end
end
