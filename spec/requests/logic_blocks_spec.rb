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
    Trace.create!(logic_diagram: diagram, recorded_at: Time.zone.parse("2026-04-29 10:00:00"))

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

  it "creates and serializes a timer counter block" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/logic_blocks", params: {
      logic_block: {
        logic_diagram_id: diagram.id,
        name: "Fan_Timer",
        block_type: "timer_counter",
        stratum: 1,
        input_expressions: { input: "true" },
        config: { mode: "active_high" }
      }
    }

    expect(response).to have_http_status(:created)

    t0 = Time.zone.parse("2026-09-30 12:00:00")
    Trace.create!(logic_diagram: diagram, recorded_at: t0)
    Trace.create!(logic_diagram: diagram, recorded_at: t0 + 45)

    get "/logic_blocks", params: { logic_diagram_id: diagram.id }

    expect(response.parsed_body.fetch("logic_blocks").first).to include(
      "type" => "TimerCounterLogicBlock",
      "block_type" => "timer_counter",
      "input" => true,
      "output" => 45.0,
      "latest_value" => 45.0
    )
  end

  it "creates and serializes expression blocks" do
    diagram = LogicDiagram.create!(name: "Boiler")

    post "/logic_blocks", params: {
      logic_block: {
        logic_diagram_id: diagram.id,
        name: "Ready",
        block_type: "expression",
        stratum: 1,
        input_expressions: { value: "2 > 1" }
      }
    }
    expect(response).to have_http_status(:created)
    ExpressionLogicBlock.create!(logic_diagram: diagram, name: "Sum", stratum: 1, input_expressions: { "value" => "2 + 0.5" })

    Trace.create!(logic_diagram: diagram)
    get "/logic_blocks", params: { logic_diagram_id: diagram.id }

    blocks = response.parsed_body.fetch("logic_blocks").index_by { |block| block["name"] }
    expect(blocks["Ready"]).to include("type" => "ExpressionLogicBlock", "block_type" => "expression", "value" => true, "output" => true, "latest_value" => true)
    expect(blocks["Sum"]).to include("value" => 2.5, "output" => 2.5)
  end
end
