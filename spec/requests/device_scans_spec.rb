require "rails_helper"

RSpec.describe "Device scans API", type: :request do
  let(:interface) { HostInterface.create!(name: "Bus", port: "/dev/missing", enabled: false) }

  def start(**fields)
    post "/device_scans", params: { device_scan: { host_interface_id: interface.id, **fields } }, as: :json
  end

  it "starts a scan over the default or a given range" do
    start
    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("device_scans").first).to include(
      "host_interface_id" => interface.id, "state" => "pending", "first_address" => 1, "last_address" => 247,
      "completed" => 0, "total" => 247, "results" => [], "error" => nil
    )
    interface.device_scans.update_all(state: "done")
    start(first_address: 3, last_address: 5)
    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("device_scans").first).to include("total" => 3)
    expect(interface.device_scans.count).to eq(1)
  end

  it "refuses an enabled bus, an active scan and a bad range" do
    start(first_address: 0)
    expect(response).to have_http_status(:unprocessable_entity)
    start(first_address: 9, last_address: 3)
    expect(response).to have_http_status(:unprocessable_entity)
    start
    start
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("errors", "base").first).to match(/already pending/)
    interface.device_scans.delete_all
    interface.update!(enabled: true)
    start
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("errors", "base").first).to match(/Disable the bus/)
  end

  it "lists the latest scan per interface" do
    start
    other = HostInterface.create!(name: "Other", port: "/dev/other", enabled: false)
    DeviceScan.create!(host_interface: other, first_address: 1, last_address: 1)
    get "/device_scans", params: { q: { host_interface_id: interface.id }.to_json }
    expect(response.parsed_body.fetch("device_scans").map { |s| s["host_interface_id"] }).to eq([ interface.id ])
  end

  it "cancels a pending scan by patching its state" do
    start
    id = response.parsed_body.fetch("id")
    patch "/device_scans/#{id}", params: { device_scan: { state: "cancelled" } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(DeviceScan.find(id)).to have_attributes(state: "cancelled", finished_at: be_present)
    # Cancelling again, or cancelling a finished scan, changes nothing.
    patch "/device_scans/#{id}", params: { device_scan: { state: "cancelled" } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(DeviceScan.find(id).state).to eq("cancelled")
  end

  it "leaves a finished scan as it ended when cancelled" do
    scan = DeviceScan.create!(host_interface: interface, first_address: 1, last_address: 1, state: "done")
    patch "/device_scans/#{scan.id}", params: { device_scan: { state: "cancelled" } }, as: :json
    expect(scan.reload.state).to eq("done")
  end

  it "accepts no other transition and ignores forged progress" do
    start
    id = response.parsed_body.fetch("id")
    %w[done running failed pending].each do |state|
      patch "/device_scans/#{id}", params: { device_scan: { state: state } }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end
    patch "/device_scans/#{id}", params: { device_scan: { completed: 247, results: [ { address: 9 } ], error: "x" } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(DeviceScan.find(id)).to have_attributes(state: "pending", completed: 0, results: [], error: nil)
  end

  it "has no destroy endpoint" do
    start
    delete "/device_scans/#{response.parsed_body.fetch("id")}"
    expect(response).to have_http_status(:not_found)
  end

  it "does not let a create forge progress" do
    start(completed: 5, state: "done", results: [ { address: 9 } ])
    expect(response.parsed_body.fetch("device_scans").first).to include("state" => "pending", "completed" => 0, "results" => [])
  end
end
