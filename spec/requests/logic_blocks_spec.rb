require "rails_helper"

RSpec.describe "Logic blocks API", type: :request do
  it "creates and lists definition-only logic blocks" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/logic_blocks", params: {
      logic_block: {
        logic_diagram_id: diagram.id,
        name: "BOT_Ready",
        block_type: "hysteresis",
        stratum: 1,
        input_expressions: { value: "145", low_limit: "130", high_limit: "140" },
        config: { mode: "active_high" },
        notes: "Boiler outlet ready."
      }
    }

    expect(response).to have_http_status(:created)
    get "/logic_blocks", params: { logic_diagram_id: diagram.id }
    serialized = response.parsed_body.fetch("logic_blocks").first
    expect(serialized).to include(
      "name" => "BOT_Ready",
      "type" => "HysteresisLogicBlock",
      "block_type" => "hysteresis",
      "stratum" => 1,
      "notes" => "Boiler outlet ready."
    )
    expect(serialized).not_to have_key("latest_value")
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
  end
end
