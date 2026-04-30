require "rails_helper"

RSpec.describe Datum, type: :model do
  it "stores polymorphic computation history for a logic block" do
    diagram = LogicDiagram.create!(name: "Boiler")
    trace = Trace.create!(logic_diagram: diagram)
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Ready",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )

    datum = described_class.create!(
      trace: trace,
      source: block,
      value: 1.0,
      state: { "output" => true },
      input_values: { "value" => 1.0 },
      recorded_at: Time.zone.parse("2026-04-28 12:00:00")
    )

    expect(datum.source).to eq(block)
    expect(block.latest_datum).to eq(datum)
  end
end
