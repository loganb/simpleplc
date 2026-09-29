require "rails_helper"

RSpec.describe "Devices API", type: :request do
  it "creates and updates host interfaces and devices for the Devices tab" do
    post "/host_interfaces", params: {
      host_interface: {
        name: "Relay Bus",
        port: "/dev/ttyUSB9",
        baud_rate: 19_200,
        data_bits: 8,
        stop_bits: 1,
        parity: "none"
      }
    }

    expect(response).to have_http_status(:created)
    host_id = response.parsed_body.fetch("id")
    expect(response.parsed_body.fetch("host_interfaces").first).to include(
      "name" => "Relay Bus",
      "port" => "/dev/ttyUSB9",
      # /dev/ttyUSB9 does not exist in the test environment, so the bus reports
      # as missing — this is what drives the "missing" badge in the UI.
      "port_present" => false,
      "resolved_device" => nil,
      # New buses start disabled until setup is reviewed.
      "enabled" => false,
      "connection_state" => "disabled",
      "connection_error" => nil,
      "poller_reported_at" => nil
    )

    post "/devices", params: {
      device: {
        name: "Relay board",
        host_interface_id: host_id,
        modbus_address: 3,
        driver: "Drivers::N4D8B08"
      }
    }

    expect(response).to have_http_status(:created)
    device_id = response.parsed_body.fetch("id")
    expect(response.parsed_body.fetch("devices").first).to include(
      "name" => "Relay board",
      "host_interface_id" => host_id,
      "modbus_address" => 3,
      "driver" => "Drivers::N4D8B08",
      "inputs" => [
        { "path" => "inputs[0]", "label" => "Input 1", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[1]", "label" => "Input 2", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[2]", "label" => "Input 3", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[3]", "label" => "Input 4", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[4]", "label" => "Input 5", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[5]", "label" => "Input 6", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[6]", "label" => "Input 7", "value_type" => "boolean", "units" => nil },
        { "path" => "inputs[7]", "label" => "Input 8", "value_type" => "boolean", "units" => nil }
      ],
      "outputs" => (1..8).map { |channel|
        { "channel" => channel, "label" => "Relay #{channel}", "value_type" => "boolean", "units" => nil }
      }
    )

    patch "/devices/#{device_id}", params: {
      device: {
        configuration_revision: Device.find(device_id).configuration_revision,
        name: "Relay I/O",
        host_interface_id: host_id,
        modbus_address: 4,
        driver: "Drivers::N4D8B08"
      }
    }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("devices").first).to include(
      "name" => "Relay I/O",
      "modbus_address" => 4
    )
  end

  it "updates labels on a live device and returns effective catalogs" do
    interface = HostInterface.create!(name: "Relay Bus", port: "/dev/missing", enabled: true)
    device = Device.create!(
      host_interface: interface,
      name: "Relay board",
      driver: "Drivers::N4D8B08",
      modbus_address: 1
    )

    patch "/devices/#{device.id}", params: {
      device: {
        configuration_revision: device.configuration_revision,
        io_labels: {
          inputs: { "inputs[0]" => "Boiler enable" },
          outputs: { "1" => "Supply fan" }
        }
      }
    }, as: :json

    expect(response).to have_http_status(:ok)
    record = response.parsed_body.fetch("devices").first
    expect(record.fetch("io_labels")).to eq(
      "inputs" => { "inputs[0]" => "Boiler enable" },
      "outputs" => { "1" => "Supply fan" }
    )
    expect(record.fetch("inputs").first.fetch("label")).to eq("Boiler enable")
    expect(record.fetch("outputs").first.fetch("label")).to eq("Supply fan")
    expect(interface.reload.enabled).to be(true)
  end

  describe "enabling and disabling a bus" do
    let(:interface) { HostInterface.create!(name: "Relay Bus", port: "/dev/ttyUSB9") }

    it "lets the operator disable an interface" do
      patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: false, configuration_revision: interface.configuration_revision } }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.fetch("host_interfaces").first).to include(
        "enabled" => false,
        # Disabling is a request; the poller has not confirmed it yet, so the
        # UI must not claim the port has been released.
        "connection_state" => "disabled"
      )
      expect(interface.reload.enabled).to be(false)
    end

    it "ignores an attempt to claim the bus is online" do
      # Only the poller may say a port is held open. A client that could set
      # this could fake a healthy bus.
      patch "/host_interfaces/#{interface.id}", params: {
        host_interface: { configuration_revision: interface.configuration_revision, enabled: true, online: true, connection_error: "nope" }
      }

      expect(interface.reload).to have_attributes(online: false, connection_error: nil)
    end
  end
end
