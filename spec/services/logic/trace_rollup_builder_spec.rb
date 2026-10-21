require "rails_helper"

RSpec.describe Logic::TraceRollupBuilder do
  def results(inputs: {}, blocks: {}, outputs: {})
    wrap = ->(values) { values.transform_values { |value| { "value" => value } } }
    { "schema_version" => 2, "logic_inputs" => wrap.(inputs), "logic_blocks" => wrap.(blocks), "logic_outputs" => wrap.(outputs) }
  end

  it "summarizes numbers" do
    rollup = described_class.build([ results(inputs: { "1" => 10.0 }), results(inputs: { "1" => 20.0 }), results(inputs: { "1" => 15.0 }) ])

    expect(rollup).to include("schema_version" => 1)
    expect(rollup.fetch("logic_inputs").fetch("1")).to eq(
      "min" => 10.0, "max" => 20.0, "mean" => 15.0, "last" => 15.0, "count" => 3, "null_count" => 0
    )
  end

  it "summarizes booleans with their fraction and transitions" do
    rollup = described_class.build([ true, true, false, true ].map { |value| results(outputs: { "7" => value }) })

    expect(rollup.fetch("logic_outputs").fetch("7")).to eq(
      "true_fraction" => 0.75, "transitions" => 2, "last" => true, "count" => 4, "null_count" => 0
    )
  end

  it "counts nulls separately and leaves a wholly null source with only null_count" do
    rollup = described_class.build([
      results(blocks: { "2" => nil, "3" => nil }),
      results(blocks: { "2" => 4.0, "3" => nil }),
      results(blocks: { "2" => nil, "3" => nil })
    ])

    blocks = rollup.fetch("logic_blocks")
    expect(blocks.fetch("2")).to include("min" => 4.0, "max" => 4.0, "count" => 1, "null_count" => 2)
    expect(blocks.fetch("3")).to eq("null_count" => 3)
  end

  it "does not count nulls as boolean transitions" do
    rollup = described_class.build([ true, nil, false ].map { |value| results(outputs: { "1" => value }) })

    expect(rollup.fetch("logic_outputs").fetch("1")).to include("transitions" => 1, "count" => 2, "null_count" => 1)
  end

  it "keeps all three buckets, empty when nothing was recorded" do
    expect(described_class.build([])).to eq(
      "schema_version" => 1, "logic_inputs" => {}, "logic_blocks" => {}, "logic_outputs" => {}
    )
  end
end
