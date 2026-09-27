require "rails_helper"
require "tmpdir"

RSpec.describe "Hardware setup journey", type: :request do
  # A fake RTU endpoint: only address 1 responds, like the observed relay board.
  class RelayEndpoint
    attr_reader :writes
    def initialize
      @writes = []
    end
    def slave(address)
      endpoint = self
      registers = Object.new
      registers.define_singleton_method(:[]) do |range|
        raise ModBus::Errors::ModBusTimeout unless address == 1
        raise ModBus::Errors::IllegalDataAddress if range == 247
        range.is_a?(Range) ? Array.new(range.size, 0) : 0
      end
      registers.define_singleton_method(:[]=) { |register, value| endpoint.writes << [ address, register, value ] }
      input = Object.new
      input.define_singleton_method(:[]) { |_| raise ModBus::Errors::ModBusTimeout }
      Struct.new(:holding_registers, :input_registers).new(registers, input)
    end
  end

  it "repairs, scans, matches a relay, applies, and polls using the public API" do
    Dir.mktmpdir do |dir|
      port = File.join(dir, "adapter")
      File.write(port, "")
      endpoint = RelayEndpoint.new
      allow(ModBus::RTUClient).to receive(:connect) do
        client = FakeRtuClient.new
        allow(client).to receive(:with_slave) { |address| endpoint.slave(address) }
        client
      end
      post "/host_interfaces", params: { host_interface: { name: "Old", port: "/dev/old-mac-port" } }
      bus = HostInterface.find(response.parsed_body.fetch("id"))
      relay = Device.create!(host_interface: bus, name: "Relay", driver: "Drivers::N4D8B08", modbus_address: 3)
      temp = Device.create!(host_interface: bus, name: "Absent", driver: "Drivers::N4DSC08", modbus_address: 1)
      patch "/host_interfaces/#{bus.id}", params: { host_interface: { port: port, name: "Relay Bus", configuration_revision: bus.reload.configuration_revision } }
      expect(response).to have_http_status(:ok)
      post "/host_interfaces/#{bus.id}/scan", params: { request_id: "journey", options: { first_address: 1, last_address: 3 } }
      expect(response).to have_http_status(:accepted)
      poller = Poller.new
      poller.run_cycle
      get "/host_interfaces/#{bus.id}"
      scanned = response.parsed_body.fetch("host_interfaces").first
      expect(scanned["scan_state"]).to eq("completed")
      expect(scanned["scan_results"]["devices"].map { |d| d["address"] }).to eq([ 1 ])
      expect(endpoint.writes).to be_empty
      request = { request_id: "apply", configuration_revision: scanned["configuration_revision"], devices: [
        { id: relay.id, name: "Relay", driver: relay.driver, modbus_address: 1, scan_request_id: "journey", profile_index: 0 }
      ] }
      post "/host_interfaces/#{bus.id}/preview", params: request, as: :json
      expect(response).to have_http_status(:ok)
      expect(Device.exists?(temp.id)).to be(true)
      post "/host_interfaces/#{bus.id}/apply", params: request, as: :json
      expect(response).to have_http_status(:ok)
      expect(Device.exists?(temp.id)).to be(false)
      expect(relay.reload.modbus_address).to eq(1)
      patch "/host_interfaces/#{bus.id}", params: { host_interface: { enabled: true, configuration_revision: bus.reload.configuration_revision } }
      expect(response).to have_http_status(:ok)
      poller.run_cycle
      first = relay.reload.last_polled_at
      travel 10.seconds do
        poller.run_cycle
        expect(relay.reload.last_polled_at).to be > first
      end
      expect(relay.current_state["status"]).to eq("ok")
      expect(endpoint.writes).to eq([ [ 1, 253, 0 ] ])
    ensure
      poller&.shut_down
    end
  end
end
