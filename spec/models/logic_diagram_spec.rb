require "rails_helper"

RSpec.describe LogicDiagram, type: :model do
  it "requires a name" do
    diagram = described_class.new(name: "")

    expect(diagram).not_to be_valid
    expect(diagram.errors[:name]).to be_present
  end

  it "contains no runtime configuration" do
    expect(described_class.column_names).not_to include("update_period", "output_enable")
  end
end
