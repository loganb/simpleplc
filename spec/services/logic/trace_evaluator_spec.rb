require "rails_helper"

RSpec.describe Logic::TraceEvaluator do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "evaluates one reusable diagram with independent instance inputs" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint", value_type: "number")
    output = LogicOutput.create!(logic_diagram: diagram, name: "Demand", value_type: "boolean", input_expression: "Setpoint > 60")
    warm = LogicInstance.create!(logic_diagram: diagram, name: "Warm zone")
    cool = LogicInstance.create!(logic_diagram: diagram, name: "Cool zone")
    LogicInputBinding.create!(logic_instance: warm, logic_input: input, source_kind: "fixed_value", fixed_value: 68)
    LogicInputBinding.create!(logic_instance: cool, logic_input: input, source_kind: "fixed_value", fixed_value: 55)

    warm_trace = Trace.create!(logic_instance: warm)
    cool_trace = Trace.create!(logic_instance: cool)

    expect(warm_trace.value_for(input)).to eq(68.0)
    expect(warm_trace.value_for(output)).to eq(true)
    expect(cool_trace.value_for(input)).to eq(55.0)
    expect(cool_trace.value_for(output)).to eq(false)
  end

  it "uses null for an unbound input" do
    input = LogicInput.create!(logic_diagram: diagram, name: "FutureSensor")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Unwired")

    trace = Trace.create!(logic_instance: instance)

    expect(trace.value_for(input)).to be_nil
    expect(trace.result_for(input).dig("state", "binding_id")).to be_nil
  end

  it "reads retained version-one trace buckets after migration" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Legacy")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Legacy room")
    trace = Trace.create!(logic_instance: instance)
    trace.update!(results: {
      "schema_version" => 1,
      "measurements" => { input.id.to_s => { "value" => 12.0 } },
      "logic_blocks" => {},
      "output_blocks" => {}
    })

    expect(trace.value_for(input)).to eq(12.0)
  end

  it "evaluates inputs, blocks, and outputs in dependency order into schema version two" do
    input = LogicInput.create!(logic_diagram: diagram, name: "BoilerOutletTemp")
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram, name: "BOT_Ready", stratum: 1,
      input_expressions: { "value" => "BoilerOutletTemp", "low_limit" => "130", "high_limit" => "140" },
      config: { "mode" => "active_high" }
    )
    output = LogicOutput.create!(logic_diagram: diagram, name: "Enable", value_type: "boolean", input_expression: "BOT_Ready")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Ordered room")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 145)

    trace = Trace.create!(logic_instance: instance)

    expect(trace.results["schema_version"]).to eq(2)
    expect(trace.value_for(input)).to eq(145.0)
    expect(trace.result_for(block)["input_values"]).to include("value" => 145.0)
    expect(trace.value_for(block)).to eq(1.0)
    expect(trace.value_for(output)).to eq(true)
  end

  it "retains block state through null inputs and keeps outputs unknown" do
    input = LogicInput.create!(logic_diagram: diagram, name: "FutureSensor")
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram, name: "Ready", stratum: 1,
      input_expressions: { "value" => "FutureSensor", "low_limit" => "0", "high_limit" => "1" }
    )
    output = LogicOutput.create!(logic_diagram: diagram, name: "Enable", value_type: "boolean", input_expression: "Ready")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Null room")
    LogicInstanceState.create!(logic_instance: instance, recorded_at: 1.minute.ago, results: Trace.empty_results.merge(
      "logic_blocks" => { block.id.to_s => {
        "id" => block.id, "name" => block.name, "type" => block.type,
        "value" => 1.0, "state" => { "output" => true }, "input_values" => {},
        "recorded_at" => 1.minute.ago.iso8601
      } }
    ))

    trace = Trace.create!(logic_instance: instance)

    expect(trace.value_for(block)).to be_nil
    expect(trace.result_for(block)["state"]).to include("output" => true)
    expect(trace.value_for(output)).to be_nil
  end

  it "counts time and evaluates named expression blocks across traces" do
    input = LogicInput.create!(logic_diagram: diagram, name: "FanCall")
    doubled = ExpressionLogicBlock.create!(logic_diagram: diagram, name: "Doubled", stratum: 1, input_expressions: { "value" => "FanCall * 2" })
    timer = TimerCounterLogicBlock.create!(logic_diagram: diagram, name: "FanTimer", stratum: 1, input_expressions: { "input" => "FanCall" })
    output = LogicOutput.create!(logic_diagram: diagram, name: "Fan", value_type: "boolean", input_expression: "Doubled > 1 && FanTimer >= 30")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Timed room")
    binding = LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 1)
    t0 = Time.zone.parse("2026-09-30 12:00:00")

    first = Trace.create!(logic_instance: instance, recorded_at: t0)
    second = Trace.create!(logic_instance: instance, recorded_at: t0 + 30)
    expect(first.value_for(doubled)).to eq(2.0)
    expect([ first.value_for(timer), second.value_for(timer) ]).to eq([ 0.0, 30.0 ])
    expect(second.value_for(output)).to eq(true)

    binding.update!(fixed_value: 0)
    stopped = Trace.create!(logic_instance: instance, recorded_at: t0 + 60)
    expect(stopped.value_for(timer)).to eq(0.0)
    expect(stopped.value_for(output)).to eq(false)
  end

  it "writes each trace once and updates the instance's state row in place" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Temp")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Single write")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 5)
    t0 = Time.zone.parse("2026-10-13 12:00:00")

    first = Trace.create!(logic_instance: instance, recorded_at: t0)
    second = Trace.create!(logic_instance: instance, recorded_at: t0 + 1)

    state = LogicInstanceState.sole
    expect(state).to have_attributes(logic_instance_id: instance.id, recorded_at: t0 + 1, results: second.results)
    expect(state.results).not_to eq(first.results)
    expect([ first.lock_version, second.lock_version ]).to eq([ 0, 0 ])
    expect(first.reload.results.dig("logic_inputs", input.id.to_s, "value")).to eq(5.0)
  end

  it "takes the state row lock while evaluating" do
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Locked")
    statements = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") { |*, payload| statements << payload[:sql] }

    Trace.create!(logic_instance: instance)

    ActiveSupport::Notifications.unsubscribe(subscriber)
    expect(statements.grep(/FROM "logic_instance_states".*FOR UPDATE/m)).not_to be_empty
  end

  it "takes block state from the state row, not from stored traces" do
    block = LatchLogicBlock.create!(
      logic_diagram: diagram, name: "Latched", stratum: 1,
      input_expressions: { "set" => "false", "reset" => "false" },
      config: { "mode" => "latch_high", "initial_output" => false }
    )
    instance = LogicInstance.create!(logic_diagram: diagram, name: "State only")
    block_result = ->(output) {
      { "id" => block.id, "name" => block.name, "type" => block.type, "value" => output ? 1.0 : 0.0,
        "state" => { "output" => output }, "input_values" => {}, "recorded_at" => 1.minute.ago.iso8601 }
    }
    stale = Trace.create!(logic_instance: instance, recorded_at: 2.minutes.ago)
    stale.update_columns(results: Trace.empty_results.merge("logic_blocks" => { block.id.to_s => block_result.(false) }))
    LogicInstanceState.find_by!(logic_instance: instance)
      .update!(results: Trace.empty_results.merge("logic_blocks" => { block.id.to_s => block_result.(true) }))

    trace = Trace.create!(logic_instance: instance)

    expect(trace.value_for(block)).to eq(1.0)
  end

  it "resolves diagram names without a query per lookup" do
    LogicInput.create!(logic_diagram: diagram, name: "A")
    ExpressionLogicBlock.create!(logic_diagram: diagram, name: "B", stratum: 1, input_expressions: { "value" => "A + 1" })
    ExpressionLogicBlock.create!(logic_diagram: diagram, name: "C", stratum: 2, input_expressions: { "value" => "B + A + B + A" })
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Cached lookups")
    lookups = 0
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      lookups += 1 if payload[:sql].match?(/FROM "logic_(blocks|inputs)".*"name" =/)
    end

    Trace.create!(logic_instance: instance)

    ActiveSupport::Notifications.unsubscribe(subscriber)
    expect(lookups).to eq(0)
  end
end
