require "rails_helper"

RSpec.describe "Measurements API", type: :request do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Room") }
  let(:input) { LogicInput.create!(logic_diagram: diagram, name: "Temp", value_type: "number") }
  let!(:measurement) { Measurement.create!(name: "Temperature") }

  it "attaches, previews samples, and detaches" do
    patch "/measurements/#{measurement.id}", params: { measurement: { logic_instance_id: instance.id, source_type: "LogicInput", source_id: input.id } }
    expect(response).to have_http_status(:ok)
    6.times { Trace.create!(logic_instance: instance) }
    get "/measurements"
    row = response.parsed_body.fetch("measurements").sole
    expect(row.fetch("source")).to include("name" => "Temp", "logic_instance_name" => "Room")
    expect(row.fetch("preview_kind")).to eq("samples")
    expect(row.fetch("preview").size).to eq(5)
    patch "/measurements/#{measurement.id}", params: { measurement: { logic_instance_id: nil, source_type: nil, source_id: nil } }
    expect(response).to have_http_status(:ok)
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.count).to eq(6)
  end

  it "rejects incomplete or unsupported attachments" do
    patch "/measurements/#{measurement.id}", params: { measurement: { source_id: input.id } }
    expect(response).to have_http_status(:unprocessable_content)
    patch "/measurements/#{measurement.id}", params: { measurement: { logic_instance_id: instance.id, source_type: "Device", source_id: 1 } }
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "returns ordered, bounded read-only history" do
    t0 = Time.utc(2026, 1, 1)
    3.times { |i| MeasurementSample.create!(measurement: measurement, recorded_at: t0 + i.minutes, snapshot: { value: i }) }
    get "/measurement_samples", params: { q: { measurement_id: measurement.id, since: t0.iso8601, limit: 2 }.to_json }
    expect(response.parsed_body.fetch("measurement_samples").map { |s| s.dig("snapshot", "value") }).to eq([ 2, 1 ])
    post "/measurement_samples", params: { measurement_sample: { measurement_id: measurement.id } }
    expect(response).to have_http_status(:not_found)
  end

  it "shows summary previews only when no raw points remain" do
    time = 3.days.ago.beginning_of_minute
    6.times do |i|
      MeasurementRollup.create!(measurement: measurement, bucket_start: time + i.minutes, sample_count: 1,
        summaries: [ { "value_type" => "number", "statistics" => { "last" => i, "count" => 1, "null_count" => 0 } } ])
    end
    get "/measurements/#{measurement.id}"
    row = response.parsed_body.fetch("measurements").sole
    expect(row.fetch("preview_kind")).to eq("rollups")
    expect(row.fetch("preview").map { |r| r.fetch("summaries").first.dig("statistics", "last") }).to eq([ 5, 4, 3, 2, 1 ])
    MeasurementSample.create!(measurement: measurement, recorded_at: Time.current, snapshot: { value: false })
    get "/measurements/#{measurement.id}"
    row = response.parsed_body.fetch("measurements").sole
    expect(row.fetch("preview_kind")).to eq("samples")
    expect(row.fetch("preview").sole.fetch("snapshot")).to eq("value" => false)
  end

  it "creates a detached probe with a human-readable name and rejects a missing source" do
    post "/measurements", params: { measurement: { name: "3rd floor temperature" } }
    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("measurements").sole).to include("source" => nil, "preview" => [])
    patch "/measurements/#{measurement.id}", params: { measurement: { logic_instance_id: instance.id, source_type: "LogicInput", source_id: 0 } }
    expect(response).to have_http_status(:unprocessable_content)
    expect(measurement.reload.logic_instance_id).to be_nil
  end
end
