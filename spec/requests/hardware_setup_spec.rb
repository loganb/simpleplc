require "rails_helper"

RSpec.describe "Hardware setup API", type: :request do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }

  it "exposes and updates the interface period" do
    get "/host_interfaces/#{interface.id}"
    expect(response.parsed_body.fetch("host_interfaces").first.fetch("update_period")).to eq(10)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { update_period: 30 } }
    expect(response).to have_http_status(:ok)
    expect(interface.reload.update_period).to eq(30)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { update_period: 0 } }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(interface.reload.update_period).to eq(30)
  end

  it "lists friendly drivers and rejects arbitrary Ruby classes" do
    get "/drivers"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("drivers").size).to eq(4)
    counter = response.parsed_body.fetch("drivers").find { |driver| driver.fetch("id") == "Drivers::WJ150" }
    expect(counter.fetch("settings").map { |setting| setting.fetch("key") }).to eq(%w[address pull_up filter_a_ms filter_b_ms])
    expect(counter.fetch("inputs").map { |input| input.fetch("path") }).to include("counts[0]", "frequencies[1]")
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

  it "applies interface edits live, last write wins" do
    interface.report_connection(online: false)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { name: "First" } }
    expect(response).to have_http_status(:ok)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { name: "Second", port: "/dev/other", baud_rate: 19_200 } }
    expect(response).to have_http_status(:ok)
    expect(interface.reload).to have_attributes(name: "Second", port: "/dev/other", baud_rate: 19_200)
  end

  it "edits and creates devices on an enabled bus" do
    interface.update!(enabled: true)
    post "/devices", params: { device: { host_interface_id: interface.id, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1 } }
    expect(response).to have_http_status(:created)
    patch "/devices/#{response.parsed_body.fetch("id")}", params: { device: { modbus_address: 2 } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(interface.devices.sole.modbus_address).to eq(2)
  end

  it "toggles a bus on and off with a plain patch of enabled" do
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: true } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(interface.reload.enabled).to be(true)
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: false } }, as: :json
    expect(interface.reload.enabled).to be(false)
  end

  it "refuses to enable a bus with an active scan until it is cancelled" do
    post "/device_scans", params: { device_scan: { host_interface_id: interface.id } }, as: :json
    expect(response).to have_http_status(:created)
    scan_id = response.parsed_body.fetch("id")
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: true } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("errors", "enabled").first).to match(/scan/)
    expect(interface.reload.enabled).to be(false)
    patch "/device_scans/#{scan_id}", params: { device_scan: { state: "cancelled" } }, as: :json
    patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: true } }, as: :json
    expect(response).to have_http_status(:ok)
  end

  it "still blocks deleting referenced devices" do
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

  it "deletes a device on an enabled bus" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    interface.update!(enabled: true)
    delete "/devices/#{device.id}"
    expect(response).to have_http_status(:no_content)
  end

  it "blocks deleting a bus whose devices are referenced, and deletes it otherwise" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    diagram = LogicDiagram.create!(name: "D")
    input = LogicInput.create!(logic_diagram: diagram, name: "input", value_type: "boolean")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "D instance")
    binding_record = LogicInputBinding.create!(logic_instance: instance, logic_input: input, device: device,
      source_kind: "device_input", source_path: "inputs[0]")
    delete "/host_interfaces/#{interface.id}"
    expect(response).to have_http_status(:conflict)
    expect(HostInterface.exists?(interface.id)).to be(true)
    binding_record.destroy!
    delete "/host_interfaces/#{interface.id}"
    expect(response).to have_http_status(:no_content)
    expect(Device.exists?(device.id)).to be(false)
  end

  it "blocks a driver change that would break output references" do
    device = Device.create!(host_interface: interface, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 1)
    diagram = LogicDiagram.create!(name: "D")
    output = LogicOutput.create!(logic_diagram: diagram, name: "relay", value_type: "boolean", input_expression: "1")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "D instance")
    LogicOutputBinding.create!(logic_instance: instance, logic_output: output, device: device, channel: 1)
    patch "/devices/#{device.id}", params: { device: { driver: "Drivers::NT48C32" } }
    expect(response).to have_http_status(:conflict)
    expect(device.reload.driver).to eq("Drivers::N4D8B08")
  end
end
