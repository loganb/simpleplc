require "rails_helper"

RSpec.describe MeasurementHistoryPointId do
  it "uses canonical readable IDs" do
    expect(described_class.encode([ "s", 1, 2 ])).to eq("s🔹1🔹2")
    expect(described_class.decode("s🔹1🔹2")).to eq([ "s", 1, 2 ])
    bucket = [ "b", 1, -123456789, 123456789, "a" * 64 ]
    expect(described_class.encode(bucket)).to eq("b🔹1🔹-123456789🔹123456789🔹#{'a' * 64}")
    expect(described_class.decode(described_class.encode(bucket))).to eq(bucket)
  end

  it "rejects malformed, noncanonical and unsafe descriptors" do
    malformed = [ "", "mhp1_WyJzIiwxLDJd", "s🔹01🔹2", "s🔹1🔹0", "s🔹1🔹+2", "s🔹1🔹2🔹3", "b🔹1🔹-0🔹1🔹#{'a' * 64}", "b🔹1🔹0🔹0🔹#{'a' * 64}", "b🔹1🔹0🔹9007199254740992🔹#{'a' * 64}", "b🔹1🔹0🔹1🔹#{'A' * 64}", "x🔹1🔹2" ]
    malformed.each { |id| expect(described_class.decode(id)).to be_nil }
  end
end
