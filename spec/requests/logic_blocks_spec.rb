require "rails_helper"

RSpec.describe "Logic blocks API", type: :request do
  it "creates and lists logic blocks" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/logic_blocks", params: {
      logic_block: {
        logic_diagram_id: diagram.id,
        name: "BOT_Ready",
        block_type: "hysteresis",
        stratum: 1,
        input_expressions: { value: "145", low_limit: "130", high_limit: "140" },
        config: { mode: "active_high" }
      }
    }

    expect(response).to have_http_status(:created)

    block = LogicBlock.find(response.parsed_body.fetch("id"))
    block.data.create!(
      value: 1.0,
      state: { "output" => true },
      input_values: { "value" => 145.0, "low_limit" => 130.0, "high_limit" => 140.0 },
      recorded_at: Time.zone.parse("2026-04-29 10:00:00")
    )

    get "/logic_blocks", params: { logic_diagram_id: diagram.id }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("logic_blocks").first).to include(
      "name" => "BOT_Ready",
      "type" => "HysteresisLogicBlock",
      "block_type" => "hysteresis",
      "stratum" => 1,
      "value" => 145.0,
      "low_limit" => 130.0,
      "high_limit" => 140.0,
      "output" => true
    )
  end

  it "updates a block using the target STI subclass validations" do
    diagram = LogicDiagram.create!(name: "Boiler")
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "BOT_Ready",
      stratum: 1,
      input_expressions: { "value" => "145", "low_limit" => "130", "high_limit" => "140" },
      config: { "mode" => "active_high" }
    )

    patch "/logic_blocks/#{block.id}", params: {
      logic_block: {
        name: "Heat_Lockout",
        block_type: "latch",
        stratum: 1,
        input_expressions: { set: "true", reset: "false" },
        config: { mode: "latch_high", dominance: "reset" }
      }
    }

    expect(response).to have_http_status(:ok)
    expect(LogicBlock.find(block.id)).to be_a(LatchLogicBlock)
    expect(response.parsed_body.fetch("logic_blocks").first).to include(
      "type" => "LatchLogicBlock",
      "block_type" => "latch",
      "set" => nil,
      "reset" => nil,
      "output" => nil
    )
  end
end
