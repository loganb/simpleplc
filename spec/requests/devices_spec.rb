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
      # A new bus is enabled but no poller has reported on it yet.
      "enabled" => true,
      "connection_state" => "unknown",
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
      "driver" => "Drivers::N4D8B08"
    )

    patch "/devices/#{device_id}", params: {
      device: {
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

  describe "enabling and disabling a bus" do
    let(:interface) { HostInterface.create!(name: "Relay Bus", port: "/dev/ttyUSB9") }

    it "lets the operator disable an interface" do
      patch "/host_interfaces/#{interface.id}", params: { host_interface: { enabled: false } }

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
        host_interface: { enabled: true, online: true, connection_error: "nope" }
      }

      expect(interface.reload).to have_attributes(online: false, connection_error: nil)
    end
  end
end
