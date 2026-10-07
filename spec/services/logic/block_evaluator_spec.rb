require "rails_helper"

RSpec.describe Logic::BlockEvaluator do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Boiler room") }

  it "retains state from the same instance's previous trace" do
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Flow_Lockout",
      stratum: 1,
      input_expressions: { "value" => "0.9", "low_limit" => "0.8", "high_limit" => "1" },
      config: { "mode" => "active_high" }
    )
    Trace.create!(logic_instance: instance, recorded_at: 1.minute.ago).tap do |previous_trace|
      previous_trace.update!(results: Trace.empty_results.merge(
        "logic_blocks" => {
          block.id.to_s => {
            "id" => block.id,
            "name" => block.name,
            "type" => block.type,
            "value" => 1.0,
            "state" => { "output" => true },
            "input_values" => {},
            "recorded_at" => previous_trace.recorded_at.iso8601
          }
        }
      ))
    end

    result = described_class.evaluate!(block, trace: Trace.create!(logic_instance: instance))

    expect(result["value"]).to eq(1.0)
    expect(result["state"]).to include("output" => true)
  end

  it "does not share retained state between instances" do
    block = LatchLogicBlock.create!(
      logic_diagram: diagram,
      name: "Heat_Lockout",
      stratum: 1,
      input_expressions: { "set" => "false", "reset" => "false" },
      config: { "mode" => "latch_high", "initial_output" => false }
    )
    other = LogicInstance.create!(logic_diagram: diagram, name: "Other room")
    previous = Trace.create!(logic_instance: instance, recorded_at: 1.minute.ago)
    previous.update!(results: Trace.empty_results.merge(
      "logic_blocks" => {
        block.id.to_s => {
          "id" => block.id,
          "name" => block.name,
          "type" => block.type,
          "value" => 1.0,
          "state" => { "output" => true },
          "input_values" => {},
          "recorded_at" => previous.recorded_at.iso8601
        }
      }
    ))

    result = described_class.evaluate!(block, trace: Trace.create!(logic_instance: other))

    expect(result["value"]).to eq(0.0)
  end

  it "tracks timer elapsed time from the instance's previous state" do
    t0 = Time.zone.parse("2026-09-30 12:00:00")
    block = TimerCounterLogicBlock.create!(
      logic_diagram: diagram,
      name: "Fan_Timer",
      stratum: 1,
      input_expressions: { "input" => "true" },
      config: { "mode" => "active_high" }
    )

    first = described_class.evaluate!(block, trace: Trace.create!(logic_instance: instance, recorded_at: t0))
    second = described_class.evaluate!(block, trace: Trace.create!(logic_instance: instance, recorded_at: t0 + 45))

    expect(first["value"]).to eq(0.0)
    expect(second["value"]).to eq(45.0)
  end
end
