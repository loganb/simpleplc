require "rails_helper"

RSpec.describe DeviceScan do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }

  def scan(**attrs) = described_class.new({ host_interface: interface, first_address: 1, last_address: 247 }.merge(attrs))

  it "computes its total from the range and starts pending and empty" do
    record = scan(first_address: 10, last_address: 19)
    record.save!
    expect(record).to have_attributes(state: "pending", total: 10, completed: 0, results: [], error: nil)
  end

  it "bounds the address range to 1-247 in order" do
    expect(scan(first_address: 0)).not_to be_valid
    expect(scan(last_address: 248)).not_to be_valid
    expect(scan(first_address: 5, last_address: 4)).not_to be_valid
    expect(scan(first_address: 5, last_address: 5)).to be_valid
  end

  it "requires the bus to be disabled" do
    interface.update!(enabled: true)
    expect(scan).not_to be_valid
    expect(scan.tap(&:valid?).errors[:base]).to include(/Disable the bus/)
  end

  it "allows one pending or running scan per bus" do
    first = scan.tap(&:save!)
    expect(scan.tap(&:valid?).errors[:base]).to include(/already pending/)
    first.update!(state: "running")
    expect(scan).not_to be_valid
    first.update!(state: "done")
    expect(scan).to be_valid
  end

  it "deletes the bus's older scans when a new one is created, but not another bus's" do
    old = scan(state: "done").tap(&:save!)
    elsewhere = DeviceScan.create!(host_interface: HostInterface.create!(name: "Other", port: "/dev/other", enabled: false), first_address: 1, last_address: 1)
    fresh = scan.tap(&:save!)
    expect(described_class.exists?(old.id)).to be(false)
    expect(described_class.exists?(elsewhere.id)).to be(true)
    expect(interface.device_scans).to contain_exactly(fresh)
  end

  it "keeps a bus from being enabled while a scan is pending or running" do
    record = scan.tap(&:save!)
    expect(interface.update(enabled: true)).to be(false)
    expect(interface.errors[:enabled]).to include(/scan/)
    record.update!(state: "running")
    expect(interface.update(enabled: true)).to be(false)
    record.update!(state: "cancelled")
    expect(interface.update(enabled: true)).to be(true)
  end

  it "does not stop other edits to a scanning bus" do
    scan.save!
    expect(interface.update(name: "Renamed")).to be(true)
  end

  it "is removed with its bus" do
    scan.save!
    expect { interface.destroy! }.to change(described_class, :count).by(-1)
  end
end
