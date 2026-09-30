require "rails_helper"

RSpec.describe ModelStoreChannel, type: :channel do
  let!(:interface) { HostInterface.create!(name: "Visible", port: "/dev/missing") }

  before { stub_connection principal: :anonymous }

  it "acknowledges a bounded set of known resource interests" do
    subscribe
    perform :interests, generation: 1, records: [ { resource: "host_interface", id: interface.id } ]
    expect(transmissions.last).to include("type" => "interests_ack", "generation" => 1)
  end

  it "filters by interest and current API scope before transmitting any IDs" do
    hidden = HostInterface.create!(name: "Hidden", port: "/dev/missing")
    subscribe
    perform :interests, generation: 1, records: [ interface, hidden ].map { |r| { resource: "host_interface", id: r.id } }
    allow(HostInterfaceApi).to receive(:record_scope).with(:anonymous).and_return(HostInterface.where(id: interface.id))
    [ interface, hidden ].each do |record|
      subscription.send(:receive_change, { "model" => "HostInterface", "id" => record.id, "lock_version" => 2 })
    end
    subscription.send(:flush_changes)
    expect(transmissions.last).to eq("type" => "record_updates", "records" => [
      { "resource" => "host_interface", "id" => interface.id, "lock_version" => 2 }
    ])
  end

  it "rejects unknown resources and malformed interests without constantizing input" do
    subscribe
    perform :interests, generation: 1, records: [ { resource: "Kernel", id: 1 } ]
    expect(transmissions.last).to include("type" => "protocol_error")
  end

  it "does not accept an older interest generation" do
    subscribe
    perform :interests, generation: 2, records: []
    perform :interests, generation: 1, records: [ { resource: "host_interface", id: interface.id } ]
    subscription.send(:receive_change, { "model" => "HostInterface", "id" => interface.id, "lock_version" => 2 })
    subscription.send(:flush_changes)
    expect(transmissions.none? { |message| message["type"] == "record_updates" }).to be(true)
  end

  it "maps STI identities to their API resource" do
    expect(RecordResources.resource_for("HysteresisLogicBlock")).to eq("logic_block")
    expect(RecordResources.resource_for("LatchLogicBlock")).to eq("logic_block")
    expect(RecordResources.resource_for("TimerCounterLogicBlock")).to eq("logic_block")
    expect(RecordResources.resource_for("HostPort")).to be_nil
  end
end
