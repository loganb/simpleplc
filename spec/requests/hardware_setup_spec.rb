require "rails_helper"

RSpec.describe "Hardware setup API", type: :request do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }
  def revision = interface.reload.configuration_revision

  it "lists friendly drivers and rejects arbitrary Ruby classes" do
    get "/drivers"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("drivers").size).to eq(3)
    relay = response.parsed_body.fetch("drivers").find { |driver| driver.fetch("id") == "Drivers::N4D8B08" }
    expect(relay.fetch("inputs").first).to include("path" => "inputs[0]", "label" => "Input 1")
    expect(relay.fetch("outputs").first).to include("channel" => 1, "label" => "Relay 1")
    post "/devices", params: { device: { host_interface_id: interface.id, name: "Bad", driver: "Object", modbus_address: 1 } }
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "protects configuration edits without conflicting with observations" do
    version = revision
    interface.report_connection(online: false)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { name: "New", configuration_revision: version } }
    expect(response).to have_http_status(:ok)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { name: "Stale", configuration_revision: version } }
    expect(response).to have_http_status(:conflict)
    expect(interface.reload.name).to eq("New")
  end

  it "exposes the state machine but does not accept forged scan results" do
    post "/host_interfaces/#{interface.id}/scan", params: { request_id: "scan-1", options: { first_address: 1, last_address: 4 } }
    expect(response).to have_http_status(:accepted)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: true, configuration_revision: revision } }
    expect(response).to have_http_status(:conflict)
    post "/host_interfaces/#{interface.id}/cancel_scan", params: { request_id: "scan-1" }
    expect(response).to have_http_status(:ok)
    expect(interface.reload.scan_state).to eq("cancelled")
  end

  it "previews and applies address swaps atomically, preserving records" do
    a = Device.create!(host_interface: interface, name: "A", driver: "Drivers::N4D8B08", modbus_address: 1)
    b = Device.create!(host_interface: interface, name: "B", driver: "Drivers::N4D8B08", modbus_address: 2)
    changes = { configuration_revision: revision, request_id: "apply-1", devices: [
      { id: a.id, name: "A", driver: a.driver, modbus_address: 2 },
      { id: b.id, name: "B", driver: b.driver, modbus_address: 1 }
    ] }
    post "/host_interfaces/#{interface.id}/preview", params: changes, as: :json
    expect(response).to have_http_status(:ok)
    expect(a.reload.modbus_address).to eq(1)
    post "/host_interfaces/#{interface.id}/apply", params: changes, as: :json
    expect(response).to have_http_status(:ok)
    expect([ a.reload.modbus_address, b.reload.modbus_address ]).to eq([ 2, 1 ])
    post "/host_interfaces/#{interface.id}/apply", params: changes, as: :json
    expect(response).to have_http_status(:ok)
  end

  it "blocks deleting referenced devices and explains the impact" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    diagram = LogicDiagram.create!(name: "D", update_period: 60)
    Measurement.create!(logic_diagram: diagram, device: device, name: "input", mode: "acquisition", source_path: "inputs[0]")
    get "/devices/#{device.id}/impact"
    expect(response.parsed_body.fetch("measurements").size).to eq(1)
    delete "/devices/#{device.id}", params: { configuration_revision: device.configuration_revision }
    expect(response).to have_http_status(:conflict)
    expect(Device.exists?(device.id)).to be(true)
  end
  it "rolls back an invalid final set and rejects stale previews" do
    a = Device.create!(host_interface: interface, name: "A", driver: "Drivers::N4D8B08", modbus_address: 1)
    old = revision
    invalid = { configuration_revision: old, request_id: "bad", devices: [
      { id: a.id, name: "Changed", driver: a.driver, modbus_address: 2 },
      { name: "Duplicate", driver: a.driver, modbus_address: 2 }
    ] }
    post "/host_interfaces/#{interface.id}/apply", params: invalid, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(a.reload.name).to eq("A")
    a.update!(name: "Someone else")
    post "/host_interfaces/#{interface.id}/apply", params: invalid, as: :json
    expect(response).to have_http_status(:conflict)
  end

  it "rejects scan choices marked no or belonging to an old attempt" do
    profile = interface.attributes.slice(*HardwareScan::PROFILE_KEYS)
    interface.update!(scan_request_id: "new", scan_state: "completed", scan_options: { port: interface.port },
      scan_results: { devices: [ { address: 1, profile_index: 0, profile: profile, driver_support: [ { driver: "Drivers::NT48C32", support: "no" } ] } ] })
    request = { configuration_revision: revision, devices: [ { name: "NTC", modbus_address: 1, driver: "Drivers::NT48C32", scan_request_id: "new", profile_index: 0 } ] }
    post "/host_interfaces/#{interface.id}/preview", params: request, as: :json
    expect(response).to have_http_status(:conflict)
    request[:devices][0][:scan_request_id] = "old"
    post "/host_interfaces/#{interface.id}/preview", params: request, as: :json
    expect(response).to have_http_status(:conflict)
  end

  it "blocks a driver change that would break output references" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    diagram = LogicDiagram.create!(name: "D", update_period: 60)
    OutputBlock.create!(logic_diagram: diagram, device: device, name: "relay", input_expression: "1", channel: 1)
    patch "/devices/#{device.id}", params: { device: { driver: "Drivers::NT48C32", configuration_revision: device.configuration_revision } }
    expect(response).to have_http_status(:conflict)
    expect(device.reload.driver).to eq("Drivers::N4D8B08")
  end
  it "returns validation errors for malformed scan options" do
    post "/host_interfaces/#{interface.id}/scan", params: { request_id: "bad", options: "not an object" }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
  end

end
