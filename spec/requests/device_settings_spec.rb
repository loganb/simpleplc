require "rails_helper"

RSpec.describe "Device settings API", type: :request do
  let(:bus) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: true) }
  let(:device) { Device.create!(host_interface: bus, name: "Flow", driver: "Drivers::WJ150", modbus_address: 2) }

  it "edits driver settings on a live bus and serializes them" do
    patch "/devices/#{device.id}", params: { device: { settings: { pull_up: true, filter_a_ms: 30 }, configuration_revision: device.configuration_revision } }, as: :json

    expect(response).to have_http_status(:ok)
    expect(device.reload.settings).to eq("pull_up" => true, "filter_a_ms" => 30)
    expect(response.parsed_body.fetch("devices").first.fetch("settings")).to eq("pull_up" => true, "filter_a_ms" => 30)
  end

  it "rejects invalid settings" do
    patch "/devices/#{device.id}", params: { device: { settings: { address: 300 }, configuration_revision: device.configuration_revision } }, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(device.reload.settings).to eq({})
  end
end
