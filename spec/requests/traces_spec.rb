require "rails_helper"

RSpec.describe "Traces API", type: :request do
  it "creates a trace and returns computed data" do
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
    expect(response.parsed_body.fetch("data").first).to include(
      "trace_id" => trace_id,
      "source_type" => "Measurement",
      "source_id" => measurement.id,
      "value" => 10.0
    )
  end
end
