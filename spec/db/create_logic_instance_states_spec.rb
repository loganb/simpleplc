require "rails_helper"
require Rails.root.join("db/migrate/20261013000001_create_logic_instance_states")

# Exercises the migration's backfill against the already-migrated test schema.
RSpec.describe CreateLogicInstanceStates do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:migration) { described_class.new }

  def block(name)
    ExpressionLogicBlock.create!(logic_diagram: diagram, name: name, stratum: 1, input_expressions: { "value" => "1" })
  end

  def result(block, value)
    { "id" => block.id, "name" => block.name, "value" => value, "state" => { "n" => value } }
  end

  def raw_trace(instance, at, blocks)
    Trace.create!(logic_instance: instance, recorded_at: at).tap do |trace|
      trace.update_columns(results: Trace.empty_results.merge("logic_blocks" => blocks.to_h { |b, value| [ b.id.to_s, result(b, value) ] }))
    end
  end

  def backfill(instance)
    LogicInstanceState.where(logic_instance_id: instance.id).delete_all
    migration.send(:backfill, described_class::MigrationInstance.find(instance.id))
    LogicInstanceState.find_by(logic_instance_id: instance.id)
  end

  it "takes the latest trace's results and recorded_at" do
    a = block("A")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Latest")
    raw_trace(instance, Time.utc(2026, 10, 13, 12), a => 1)
    raw_trace(instance, Time.utc(2026, 10, 13, 12, 5), a => 2)

    state = backfill(instance)

    expect(state.recorded_at).to eq(Time.utc(2026, 10, 13, 12, 5))
    expect(state.results.dig("logic_blocks", a.id.to_s, "value")).to eq(2)
  end

  it "fills in block results the latest trace lacks from the newest older trace that has them" do
    a = block("A")
    b = block("B")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Filled")
    raw_trace(instance, Time.utc(2026, 10, 13, 12, 0), a => 1, b => 10)
    raw_trace(instance, Time.utc(2026, 10, 13, 12, 1), b => 11)
    raw_trace(instance, Time.utc(2026, 10, 13, 12, 2), a => 3)

    state = backfill(instance)

    blocks = state.results.fetch("logic_blocks")
    expect(blocks.dig(a.id.to_s, "value")).to eq(3)
    expect(blocks.dig(b.id.to_s, "value")).to eq(11)
  end

  it "pages through older traces and leaves never-computed blocks absent" do
    stub_const("#{described_class}::BATCH", 2)
    a = block("A")
    never = block("Never")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Paged")
    raw_trace(instance, Time.utc(2026, 10, 13, 12, 0), a => 7)
    5.times { |minute| raw_trace(instance, Time.utc(2026, 10, 13, 12, 1 + minute), {}) }

    state = backfill(instance)

    expect(state.results.dig("logic_blocks", a.id.to_s, "value")).to eq(7)
    expect(state.results.fetch("logic_blocks")).not_to have_key(never.id.to_s)
  end

  it "creates no row for an instance that never ran" do
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Idle")

    expect(backfill(instance)).to be_nil
  end
end
