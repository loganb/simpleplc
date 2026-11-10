require "rails_helper"

RSpec.describe MeasurementHistoryPointId do
  it "uses canonical base64url JSON IDs" do
    expect(described_class.encode([ "s", 1, 2 ])).to eq("mhp1_WyJzIiwxLDJd")
    expect(described_class.decode("mhp1_WyJzIiwxLDJd")).to eq([ "s", 1, 2 ])
    bucket = [ "b", 1, -123456789, 123456789, "a" * 64 ]
    expect(described_class.decode(described_class.encode(bucket))).to eq(bucket)
  end

  it "rejects malformed, noncanonical and unsafe descriptors" do
    malformed = [ "", "mhp2_WyJzIiwxLDJd", "mhp1_WyJzIiwxLDJd=", "mhp1_WyAicyIsMSwyXQ", "mhp1_W10", "mhp1_aGVsbG8" ]
    malformed += [ [ "s", 1, 0 ], [ "s", "1", 2 ], [ "b", 1, 0, 0, "a" * 64 ], [ "b", 1, 0, 9_007_199_254_740_992, "a" * 64 ], [ "b", 1, 0, 1, "A" * 64 ], [ "x", 1, 2 ] ].map { |x| described_class.encode(x) }
    malformed.each { |id| expect(described_class.decode(id)).to be_nil }
  end
end
