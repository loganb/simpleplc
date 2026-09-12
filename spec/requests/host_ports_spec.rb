require "rails_helper"

RSpec.describe "HostPorts API", type: :request do
  def build_port(tty:, by_id: nil, by_path: nil, console: false, **overrides)
    HostPort.new(
      tty:              tty,
      device:           "/dev/#{tty}",
      by_id:            by_id,
      by_path:          by_path,
      label:            "FTDI FT230X Basic UART",
      kernel_driver:    "ftdi_sio",
      usb_vendor_id:    "0403",
      usb_product_id:   "6015",
      usb_manufacturer: "FTDI",
      usb_product:      "FT230X Basic UART",
      usb_serial:       "D30E7F3F",
      console:          console,
      **overrides
    )
  end

  let(:usb_port) do
    build_port(
      tty: "ttyUSB0",
      by_id: "/dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0",
      by_path: "/dev/serial/by-path/platform-xhci-hcd.0-usb-0:1:1.0-port0"
    )
  end

  let(:console_port) do
    build_port(
      tty: "ttyAMA10",
      console: true,
      label: "arm,pl011-axi",
      kernel_driver: "port",
      usb_vendor_id: nil, usb_product_id: nil,
      usb_manufacturer: nil, usb_product: nil, usb_serial: nil
    )
  end

  before { allow(HostPortScanner).to receive(:scan).and_return([ console_port, usb_port ]) }

  describe "GET /host_ports" do
    it "returns the scanned ports in the flat wire format" do
      get "/host_ports.json"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.fetch("query")).to eq([ console_port.id, usb_port.id ])

      serialized = response.parsed_body.fetch("host_ports").find { |p| p["tty"] == "ttyUSB0" }
      expect(serialized).to include(
        "id"               => usb_port.id,
        "tty"              => "ttyUSB0",
        "device"           => "/dev/ttyUSB0",
        "by_id"            => usb_port.by_id,
        "by_path"          => usb_port.by_path,
        "stable_path"      => usb_port.by_id,
        "identity_basis"   => "by_id",
        "label"            => "FTDI FT230X Basic UART",
        "kernel_driver"    => "ftdi_sio",
        "usb_serial"       => "D30E7F3F",
        "console"          => false,
        "host_interface_id" => nil
      )
    end

    it "flags the kernel console so the UI can warn before it is selected" do
      get "/host_ports.json"

      serialized = response.parsed_body.fetch("host_ports").find { |p| p["tty"] == "ttyAMA10" }
      expect(serialized).to include("console" => true, "identity_basis" => "device")
    end
  end

  describe "linking a port to the interface using it" do
    it "reports host_interface_id for an interface configured with the by-id path" do
      interface = HostInterface.create!(name: "Bus A", port: usb_port.by_id)

      get "/host_ports.json"

      serialized = response.parsed_body.fetch("host_ports").find { |p| p["tty"] == "ttyUSB0" }
      expect(serialized.fetch("host_interface_id")).to eq(interface.id)
    end

    it "matches an interface configured with the raw device node to the same port" do
      # Interfaces predating the scanner hold /dev/ttyUSB0 rather than a stable
      # alias; they must still show as claiming the port they actually open.
      interface = HostInterface.create!(name: "Legacy", port: "/dev/ttyUSB0")
      allow(File).to receive(:realpath).and_call_original
      allow(File).to receive(:realpath).with(usb_port.by_id).and_return("/dev/ttyUSB0")

      get "/host_ports.json"

      serialized = response.parsed_body.fetch("host_ports").find { |p| p["tty"] == "ttyUSB0" }
      expect(serialized.fetch("host_interface_id")).to eq(interface.id)
    end

    it "leaves ports unclaimed when no interface resolves to them" do
      HostInterface.create!(name: "Elsewhere", port: "/dev/ttyUSB9")

      get "/host_ports.json"

      expect(response.parsed_body.fetch("host_ports").map { |p| p["host_interface_id"] }).to all(be_nil)
    end
  end

  describe "GET /host_ports/:id" do
    it "round-trips the encoded id back to the same port" do
      get "/host_ports/#{usb_port.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.fetch("host_ports").first).to include(
        "id" => usb_port.id, "tty" => "ttyUSB0"
      )
    end

    it "routes an id containing base64url characters without a route constraint" do
      # by-path aliases contain dots and colons; the encoding is what keeps them
      # out of the URL. This is the case that broke under a raw-path id.
      port = build_port(tty: "ttyUSB1", by_path: "/dev/serial/by-path/platform-xhci-hcd.0-usb-0:1:1.0-port0")
      allow(HostPortScanner).to receive(:scan).and_return([ port ])

      get "/host_ports/#{port.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.fetch("host_ports").first).to include("identity_basis" => "by_path")
    end

    it "404s for a port that is no longer present" do
      vanished = build_port(tty: "ttyUSB7").id
      get "/host_ports/#{vanished}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s rather than 500s for a malformed id" do
      get "/host_ports/not-a-valid-base64-id~~"

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "read-only" do
    it "exposes no mutation routes" do
      post "/host_ports", params: { host_port: { tty: "ttyUSB0" } }
      expect(response).to have_http_status(:not_found)

      delete "/host_ports/#{usb_port.id}"
      expect(response).to have_http_status(:not_found)

      patch "/host_ports/#{usb_port.id}", params: { host_port: { tty: "ttyUSB0" } }
      expect(response).to have_http_status(:not_found)
    end
  end
end
