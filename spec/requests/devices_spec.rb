require "rails_helper"

RSpec.describe "Devices API", type: :request do
  it "creates and updates host interfaces and devices for the Devices tab" do
    post "/host_interfaces", params: {
      host_interface: {
        port: "/dev/ttyUSB9",
        baud_rate: 19_200,
        data_bits: 8,
        stop_bits: 1,
        parity: "none"
      }
    }

    expect(response).to have_http_status(:created)
    host_id = response.parsed_body.fetch("id")

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
end
