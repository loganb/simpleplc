require "rails_helper"

RSpec.describe Logic::Expression do
  def evaluate(source)
    described_class.evaluate(source, context: Logic::EvaluationContext.empty)
  end

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

  describe "SQL three-valued logic for && and ||" do
    {
      "false && null" => false, "null && false" => false,
      "true && null" => nil, "null && true" => nil, "null && null" => nil,
      "true || null" => true, "null || true" => true,
      "false || null" => nil, "null || false" => nil, "null || null" => nil,
      "0 && null" => false, "5 || null" => true
    }.each do |source, expected|
      it "evaluates #{source} to #{expected.inspect}" do
        expect(evaluate(source)).to eq(expected)
      end
    end

    it "keeps !null as null" do
      expect(evaluate("!(null && true)")).to be_nil
      expect(evaluate("!(null && false)")).to eq(true)
    end
  end

  it "returns null for division by zero" do
    expect(evaluate("1 / 0")).to be_nil
    expect(evaluate("0 / 0")).to be_nil
    expect(evaluate("1 / 0 ?? 5")).to eq(5.0)
    expect(evaluate("6 / 3")).to eq(2.0)
  end

  describe "?? operator" do
    it "returns the left side unless it is null" do
      expect(evaluate("null ?? 3")).to eq(3.0)
      expect(evaluate("2 ?? 3")).to eq(2.0)
      expect(evaluate("false ?? true")).to eq(false)
      expect(evaluate("null ?? null")).to be_nil
    end

    it "chains" do
      expect(evaluate("null ?? null ?? 4")).to eq(4.0)
    end

    it "binds more loosely than every other operator" do
      expect(evaluate("null > 1 ?? false")).to eq(false)
      expect(evaluate("null || false ?? true")).to eq(true)
      expect(evaluate("1 + (null ?? 2)")).to eq(3.0)
    end

    it "does not evaluate the right side when the left is not null" do
      expect(evaluate("1 ?? unknown_name")).to eq(1.0)
    end
  end

  describe "coalesce()" do
    it "returns the first non-null argument" do
      expect(evaluate("coalesce(null, 2, 3)")).to eq(2.0)
      expect(evaluate("coalesce(false, 2)")).to eq(false)
      expect(evaluate("coalesce(7)")).to eq(7.0)
    end

    it "returns null when every argument is null" do
      expect(evaluate("coalesce(null, null)")).to be_nil
    end

    it "is case-insensitive" do
      expect(evaluate("COALESCE(null, 1)")).to eq(1.0)
    end

    it "evaluates arguments lazily" do
      expect(evaluate("coalesce(1, unknown_name)")).to eq(1.0)
    end

    it "composes with other operators" do
      expect(evaluate("coalesce(null, 2) * 3")).to eq(6.0)
      expect(evaluate("coalesce(null, 1 + 1, 5)")).to eq(2.0)
      expect(evaluate("coalesce(coalesce(null), null ?? 4)")).to eq(4.0)
    end

    it "rejects unknown functions and empty calls" do
      expect { evaluate("foo(1)") }.to raise_error(Logic::Expression::Error)
      expect { evaluate("coalesce()") }.to raise_error(Logic::Expression::Error)
      expect { evaluate("coalesce(1,)") }.to raise_error(Logic::Expression::Error)
      expect { evaluate("coalesce(1") }.to raise_error(Logic::Expression::Error)
    end

    it "does not report the function name as a reference" do
      expect(described_class.references("coalesce(a, b) ?? c")).to eq(identifiers: %w[a b c])
    end
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
