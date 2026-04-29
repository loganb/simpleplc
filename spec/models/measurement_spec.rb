require "rails_helper"

RSpec.describe Measurement, type: :model do
  it "requires expression-safe unique names" do
    measurement = described_class.new(name: "DHW Temp", source_type: "device", update_period: 60)

    expect(measurement).not_to be_valid
    expect(measurement.errors[:name].join).to include("expression-safe identifier")
  end
end
