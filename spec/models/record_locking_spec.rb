require "rails_helper"

RSpec.describe "Record locking", type: :request do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing") }

  it "enables locking with a non-null zero default on every application table" do
    [ HostInterface, Device, LogicDiagram, Measurement, LogicBlock, OutputBlock, Trace ].each do |model|
      column = model.columns_hash.fetch("lock_version")
      expect(column.null).to be(false)
      expect(column.default.to_i).to eq(0)
      expect(model.locking_enabled?).to be_truthy
    end
  end

  it "rejects stale saves and destroys" do
    stale = HostInterface.find(interface.id)
    interface.update!(name: "New name")
    expect { stale.update!(name: "Old writer") }.to raise_error(ActiveRecord::StaleObjectError)
    expect { stale.destroy! }.to raise_error(ActiveRecord::StaleObjectError)
  end

  it "reports through update callbacks, advances timestamps and preserves concurrent edits" do
    stale = HostInterface.find(interface.id)
    interface.update!(name: "Renamed")
    callback = ->(record) { record.name = "Callback ran" if record.connection_error == "test callback" }
    HostInterface.set_callback(:update, :before, callback)
    begin
      travel_to(1.minute.from_now) do
        stale.report_connection(online: true, error: "test callback")
      end
      expect(interface.reload.name).to eq("Callback ran")
      expect(interface.lock_version).to eq(2)
      expect(interface.updated_at).to be > interface.created_at
    ensure
      HostInterface.skip_callback(:update, :before, callback)
    end
  end

  it "keeps operator intent when a stale reporter saves" do
    stale = HostInterface.find(interface.id)
    interface.update!(enabled: false)
    stale.report_connection(online: true)
    expect(interface.reload).to have_attributes(enabled: false, online: true, lock_version: 2)
  end

  it "returns lock versions for primary and sideloaded API records" do
    device = Device.create!(host_interface: interface, driver: "Drivers::N4D8B08", modbus_address: 1)
    get "/devices/#{device.id}"
    expect(response.parsed_body.fetch("devices").first.fetch("lock_version")).to eq(0)
    expect(response.parsed_body.fetch("host_interfaces").first.fetch("lock_version")).to eq(0)
  end

  it "bounds retries when another writer repeatedly wins" do
    allow(interface).to receive(:save!).and_raise(ActiveRecord::StaleObjectError.new(interface, "update"))
    expect(interface.report_connection(online: true)).to be(false)
    expect(interface).to have_received(:save!).exactly(3).times
    expect(interface.reload.online).to be(false)
  end

  it "runs commit hooks for reports but not rolled back reports" do
    interface
    commits = []
    callback = ->(record) { commits << record.id }
    HostInterface.set_callback(:commit, :after, callback)
    begin
      interface.report_connection(online: true)
      expect(commits).to eq([ interface.id ])
      commits.clear
      HostInterface.transaction(requires_new: true) do
        interface.report_connection(online: false)
        raise ActiveRecord::Rollback
      end
      expect(commits).to be_empty
      expect(interface.reload.online).to be(true)
    ensure
      HostInterface.skip_callback(:commit, :after, callback)
    end
  end

  it "returns a conflict when a concurrent writer changes an API update" do
    interface
    allow_any_instance_of(HostInterfaceApi).to receive(:update).and_wrap_original do |original, object, params|
      HostInterface.find(object.id).update!(name: "Concurrent edit")
      original.call(object, params)
    end
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { name: "Stale edit" } }
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.fetch("errors").fetch("base")).not_to be_empty
    expect(interface.reload.name).to eq("Concurrent edit")
  end

  it "serializes the persisted trace version after its creation callback computes results" do
    diagram = LogicDiagram.create!(name: "Test", update_period: 60)
    Measurement.create!(logic_diagram: diagram, name: "temperature", mode: "simulation", simulation_value: 20)
    post "/traces", params: { trace: { logic_diagram_id: diagram.id } }
    expect(response).to have_http_status(:created)
    trace = Trace.find(response.parsed_body.fetch("id"))
    expect(trace.lock_version).to eq(1)
    expect(response.parsed_body.fetch("traces").first.fetch("lock_version")).to eq(trace.lock_version)
  end
end
