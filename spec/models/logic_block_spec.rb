require "rails_helper"

RSpec.describe LogicBlock, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "accepts expressions over logical inputs" do
    LogicInput.create!(logic_diagram: diagram, name: "DHW_Temp")
    block = HysteresisLogicBlock.new(
      logic_diagram: diagram,
      name: "DHW_Call",
      stratum: 1,
      input_expressions: {
        "value" => "coalesce(DHW_Temp, 150)",
        "low_limit" => "DHW_Temp ?? 140",
        "high_limit" => "160"
      },
      config: { "mode" => "active_low" }
    )

    expect(block).to be_valid
  end

  it "rejects unknown and non-upstream references" do
    upstream = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Upstream",
      stratum: 2,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" }
    )
    unknown = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Unknown",
      stratum: 2,
      input_expressions: { "set" => "Missing", "reset" => "false" }
    )
    downstream = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Downstream",
      stratum: 2,
      input_expressions: { "set" => upstream.name, "reset" => "false" }
    )

    expect(unknown).not_to be_valid
    expect(unknown.errors[:input_expressions].join).to include("unknown name Missing")
    expect(downstream).not_to be_valid
    expect(downstream.errors[:input_expressions].join).to include("not upstream")
  end

  it "rejects expression-unsafe names and invalid subtype config" do
    block = HysteresisLogicBlock.new(
      logic_diagram: diagram,
      name: "DHW Call",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: { "mode" => "sideways" }
    )

    expect(block).not_to be_valid
    expect(block.errors[:name].join).to include("expression-safe identifier")
    expect(block.errors[:config].join).to include("active_high or active_low")
  end

  it "implements hysteresis, latch, timer, and expression evaluation" do
    hysteresis = HysteresisLogicBlock.new
    expect(hysteresis.evaluate_logic(
      { "value" => true, "low_limit" => 0.2, "high_limit" => 0.8 }, {}
    ).first).to eq(true)

    latch = LatchLogicBlock.new(config: { "mode" => "latch_high", "dominance" => "reset" })
    expect(latch.evaluate_logic({ "set" => true, "reset" => false }, {}).first).to eq(true)

    t0 = Time.zone.parse("2026-09-30 12:00:00")
    timer = TimerCounterLogicBlock.new
    value, state = timer.evaluate_logic({ "input" => true }, {}, recorded_at: t0)
    expect(value).to eq(0.0)
    expect(timer.evaluate_logic({ "input" => true }, state, recorded_at: t0 + 5).first).to eq(5.0)

    expression = ExpressionLogicBlock.new
    expect(expression.evaluate_logic({ "value" => false }, {}).first).to eq(false)
  end

  it "preserves hysteresis state when an input is unknown" do
    block = HysteresisLogicBlock.new(config: { "initial_output" => true })

    value, state = block.evaluate_logic(
      { "value" => nil, "low_limit" => 10, "high_limit" => 20 },
      { "output" => true }
    )

    expect(value).to be_nil
    expect(state).to include("output" => true)
  end

  it "exposes latch configuration and rejects invalid values" do
    reset_dominant = LatchLogicBlock.new(config: { "mode" => "latch_high", "dominance" => "reset" })
    set_dominant = LatchLogicBlock.new(config: { "mode" => "latch_high", "dominance" => "set" })

    expect(reset_dominant).to be_latch_high
    expect(reset_dominant.dominance).to eq("reset")
    expect(set_dominant.dominance).to eq("set")

    invalid = LatchLogicBlock.new(
      logic_diagram: diagram, name: "BadLatch", stratum: 1,
      input_expressions: { "set" => "true", "reset" => "false" },
      config: { "mode" => "sticky", "dominance" => "maybe" }
    )
    expect(invalid).not_to be_valid
    expect(invalid.errors[:config].join).to include("latch_high or latch_low", "reset or set")
  end

  it "handles active-low, unknown, reset, and non-monotonic timer inputs" do
    t0 = Time.zone.parse("2026-09-30 12:00:00.250")
    timer = TimerCounterLogicBlock.new(config: { "mode" => "active_low" })
    _, state = timer.evaluate_logic({ "input" => false }, {}, recorded_at: t0)

    expect(timer.evaluate_logic({ "input" => false }, state, recorded_at: t0 + 30).first).to eq(30.0)
    expect(timer.evaluate_logic({ "input" => nil }, state, recorded_at: t0 + 30)).to eq([ nil, state ])
    expect(timer.evaluate_logic({ "input" => true }, state, recorded_at: t0 + 30)).to eq([ 0.0, { "active_since" => nil } ])
    expect(timer.evaluate_logic({ "input" => false }, state, recorded_at: t0 - 10).first).to eq(0.0)
  end

  it "requires subtype inputs" do
    timer = TimerCounterLogicBlock.new(logic_diagram: diagram, name: "Timer", stratum: 1, input_expressions: {})
    expression = ExpressionLogicBlock.new(logic_diagram: diagram, name: "Expression", stratum: 1, input_expressions: {})

    expect(timer).not_to be_valid
    expect(timer.errors[:input_expressions].join).to include("missing input")
    expect(expression).not_to be_valid
    expect(expression.errors[:input_expressions].join).to include("missing value")
  end
end
