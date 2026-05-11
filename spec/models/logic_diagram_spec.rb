require "rails_helper"

RSpec.describe LogicDiagram, type: :model do
  it "defaults output_enable to false" do
    diagram = described_class.create!(name: "Boiler")

    expect(diagram).not_to be_output_enable
  end

  it "requires a name" do
    diagram = described_class.new(name: "")

    expect(diagram).not_to be_valid
    expect(diagram.errors[:name]).to be_present
  end

  it "requires a positive update period" do
    diagram = described_class.new(name: "Boiler", update_period: 0)

    expect(diagram).not_to be_valid
    expect(diagram.errors[:update_period]).to be_present
  end
end
