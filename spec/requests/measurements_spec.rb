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

  it "clears raw and summarized history without changing measurement identity or attachment" do
    patch "/measurements/#{measurement.id}", params: { measurement: { logic_instance_id: instance.id, source_type: "LogicInput", source_id: input.id } }
    time = 3.days.ago.beginning_of_minute
    MeasurementSample.create!(measurement: measurement, recorded_at: Time.current, snapshot: { value: 4 })
    MeasurementRollup.create!(measurement: measurement, bucket_start: time, sample_count: 1, summaries: [])
    other = Measurement.create!(name: "Other")
    MeasurementSample.create!(measurement: other, recorded_at: Time.current, snapshot: { value: 9 })

    expect(RecordChanges).to receive(:publish).with(measurement).once
    patch "/measurements/#{measurement.id}", params: { measurement: { clear_data: true } }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("measurements").sole).to include("name" => "Temperature", "logic_instance_id" => instance.id, "source_type" => "LogicInput", "source_id" => input.id, "preview" => [], "preview_kind" => nil)
    expect(measurement.reload.measurement_samples).to be_empty
    expect(measurement.measurement_rollups).to be_empty
    expect(other.measurement_samples.count).to eq(1)
    expect(response.parsed_body.fetch("invalidates")).to include("measurement" => "queries", "measurement_sample" => "queries", "measurement_rollup" => "queries", "measurement_history_point" => "queries")
    Trace.create!(logic_instance: instance)
    expect(measurement.measurement_samples.count).to eq(1)
  end

  it "rolls back clearing history when the accompanying attachment is invalid" do
    sample = MeasurementSample.create!(measurement: measurement, recorded_at: Time.current, snapshot: { value: 4 })
    rollup = MeasurementRollup.create!(measurement: measurement, bucket_start: 3.days.ago.beginning_of_minute, sample_count: 1, summaries: [])

    patch "/measurements/#{measurement.id}", params: { measurement: { clear_data: true, source_id: input.id } }

    expect(response).to have_http_status(:unprocessable_content)
    expect(measurement.measurement_samples.sole).to eq(sample)
    expect(measurement.measurement_rollups.sole).to eq(rollup)
  end

  it "treats a false clear flag as a no-op while preserving normal updates" do
    sample = MeasurementSample.create!(measurement: measurement, recorded_at: Time.current, snapshot: { value: 4 })

    patch "/measurements/#{measurement.id}", params: { measurement: { name: "Renamed", clear_data: false } }

    expect(response).to have_http_status(:ok)
    expect(measurement.reload.name).to eq("Renamed")
    expect(measurement.measurement_samples.sole).to eq(sample)
    expect(response.parsed_body.fetch("measurements").sole).not_to have_key("clear_data")
  end

  it "deletes a measurement and its history but preserves its instance and traces" do
    patch "/measurements/#{measurement.id}", params: { measurement: { logic_instance_id: instance.id, source_type: "LogicInput", source_id: input.id } }
    Trace.create!(logic_instance: instance)
    MeasurementSample.create!(measurement: measurement, recorded_at: Time.current, snapshot: { value: 4 })
    MeasurementRollup.create!(measurement: measurement, bucket_start: 3.days.ago.beginning_of_minute, sample_count: 1, summaries: [])

    delete "/measurements/#{measurement.id}"

    expect(response).to have_http_status(:no_content)
    expect(Measurement.exists?(measurement.id)).to be(false)
    expect(MeasurementSample.exists?(measurement_id: measurement.id)).to be(false)
    expect(MeasurementRollup.exists?(measurement_id: measurement.id)).to be(false)
    expect(LogicInstance.exists?(instance.id)).to be(true)
    expect(Trace.exists?(logic_instance_id: instance.id)).to be(true)
  end
end
