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

  it "shows one driver by its opaque id, as the frontend store fetches it" do
    get "/drivers/#{ERB::Util.url_encode("Drivers::N4D8B08")}"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("drivers").map { |d| d.fetch("id") }).to eq([ "Drivers::N4D8B08" ])
    get "/drivers/Object"
    expect(response).to have_http_status(:not_found)
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

  it "starts and cancels a scan by patching its state, separately from configuration" do
    url = "/host_interfaces/#{interface.id}"
    patch url, params: { host_interface: { scan_state: "requested", scan_options: { first_address: 1, last_address: 4 } } }, as: :json
    expect(response).to have_http_status(:ok)
    scanned = response.parsed_body.fetch("host_interfaces").first
    expect(scanned).to include("scan_state" => "requested", "scan_request_id" => be_present)
    expect(interface.reload.scan_options).to include("first_address" => 1, "last_address" => 4)
    patch url, params: { host_interface: { enabled: true, configuration_revision: revision } }, as: :json
    expect(response).to have_http_status(:conflict)
    patch url, params: { host_interface: { scan_state: "cancelling", name: "Renamed" } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    patch url, params: { host_interface: { scan_state: "completed" } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    patch url, params: { host_interface: { scan_state: "cancelling" } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(interface.reload.scan_state).to eq("cancelled")
    expect(interface.name).to eq("Bus")
  end

  it "does not let clients forge scan progress or results" do
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { scan_state: "requested", scan_results: { devices: [ { address: 9 } ] } } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(interface.reload.scan_results["devices"]).to eq([])
  end

  it "deletes without a revision but still blocks referenced devices" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    spare = Device.create!(host_interface: interface, name: "Spare", driver: "Drivers::N4D8B08", modbus_address: 2)
    diagram = LogicDiagram.create!(name: "D")
    input = LogicInput.create!(logic_diagram: diagram, name: "input", value_type: "boolean")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "D instance")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, device: device,
      source_kind: "device_input", source_path: "inputs[0]")
    delete "/devices/#{device.id}"
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.dig("details", "logic_input_bindings").size).to eq(1)
    expect(Device.exists?(device.id)).to be(true)
    delete "/devices/#{spare.id}"
    expect(response).to have_http_status(:no_content)
    expect(Device.exists?(spare.id)).to be(false)
  end

  it "still requires a disabled bus to delete" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    interface.reload.update!(enabled: true)
    delete "/devices/#{device.id}"
    expect(response).to have_http_status(:conflict)
    expect(Device.exists?(device.id)).to be(true)
  end

  it "blocks a driver change that would break output references" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    diagram = LogicDiagram.create!(name: "D")
    output = LogicOutput.create!(logic_diagram: diagram, name: "relay", value_type: "boolean", input_expression: "1")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "D instance")
    LogicOutputBinding.create!(logic_instance: instance, logic_output: output, device: device, channel: 1)
    patch "/devices/#{device.id}", params: { device: { driver: "Drivers::NT48C32", configuration_revision: device.configuration_revision } }
    expect(response).to have_http_status(:conflict)
    expect(device.reload.driver).to eq("Drivers::N4D8B08")
  end

  it "returns validation errors for malformed scan options" do
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { scan_state: "requested", scan_options: "not an object" } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { scan_state: "requested", scan_options: { first_address: 0 } } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(interface.reload.scan_state).to eq("idle")
  end
end
