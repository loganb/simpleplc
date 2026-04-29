require "rails_helper"

RSpec.describe "Data API", type: :request do
  it "queries polymorphic datum history" do
    diagram = LogicDiagram.create!(name: "Boiler")
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Ready",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )
    datum = block.data.create!(
      value: 1.0,
      state: { "output" => true },
      input_values: { "value" => 1.0 },
      recorded_at: Time.zone.parse("2026-04-28 12:00:00")
    )

    get "/data", params: { source_type: "LogicBlock", source_id: block.id, limit: 1 }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("query")).to eq([ datum.id ])
    expect(response.parsed_body.fetch("data").first).to include(
      "source_type" => "LogicBlock",
      "source_id" => block.id,
      "value" => 1.0
    )
  end
end
