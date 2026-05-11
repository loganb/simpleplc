require "rails_helper"

RSpec.describe Logic::Expression do
  it "evaluates arithmetic, comparisons, and booleans" do
    result = described_class.evaluate("(2 + 3) * 4 >= 20 && !false", context: Logic::EvaluationContext.empty)

    expect(result).to eq(true)
  end

  it "treats zero as false and non-zero as true" do
    expect(described_class.evaluate("0 || 5", context: Logic::EvaluationContext.empty)).to eq(true)
    expect(described_class.evaluate("!0", context: Logic::EvaluationContext.empty)).to eq(true)
  end

  it "coerces booleans when used as numbers" do
    expect(described_class.evaluate("true + 2", context: Logic::EvaluationContext.empty)).to eq(3.0)
    expect(described_class.evaluate("false * 10", context: Logic::EvaluationContext.empty)).to eq(0.0)
  end

  it "propagates null through regular operators" do
    expect(described_class.evaluate("null + 1", context: Logic::EvaluationContext.empty)).to be_nil
    expect(described_class.evaluate("null && true", context: Logic::EvaluationContext.empty)).to be_nil
    expect(described_class.evaluate("5 > null", context: Logic::EvaluationContext.empty)).to be_nil
    expect(described_class.evaluate("!null", context: Logic::EvaluationContext.empty)).to be_nil
  end

  it "supports coercive and exact equality" do
    expect(described_class.evaluate("true == 1", context: Logic::EvaluationContext.empty)).to eq(true)
    expect(described_class.evaluate("false == 0", context: Logic::EvaluationContext.empty)).to eq(true)
    expect(described_class.evaluate("true != 1", context: Logic::EvaluationContext.empty)).to eq(false)
    expect(described_class.evaluate("true === 1", context: Logic::EvaluationContext.empty)).to eq(false)
    expect(described_class.evaluate("true !== 1", context: Logic::EvaluationContext.empty)).to eq(true)
    expect(described_class.evaluate("null === null", context: Logic::EvaluationContext.empty)).to eq(true)
    expect(described_class.evaluate("null == 0", context: Logic::EvaluationContext.empty)).to be_nil
    expect(described_class.evaluate("null != false", context: Logic::EvaluationContext.empty)).to be_nil
  end

  it "extracts name references" do
    refs = described_class.references("BoilerOutletTemp > 0 && BOT_Ready")

    expect(refs).to eq(identifiers: [ "BoilerOutletTemp", "BOT_Ready" ])
  end

  it "rejects legacy id-token syntax" do
    expect {
      described_class.references("logic_block:3")
    }.to raise_error(Logic::Expression::Error)
  end

  it "rejects unexpected tokens" do
    expect {
      described_class.evaluate("Kernel.exec('nope')", context: Logic::EvaluationContext.empty)
    }.to raise_error(Logic::Expression::Error)
  end
end
