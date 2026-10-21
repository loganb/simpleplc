require "rails_helper"

RSpec.describe "Measurement series API", type: :request do
  let(:measurement) { Measurement.create!(name: "Series") }

  it "returns exact values including null in a short recent range" do
    now = Time.current.change(usec: 0)
    MeasurementSample.create!(measurement: measurement, recorded_at: now - 20.seconds, value: 7)
    MeasurementSample.create!(measurement: measurement, recorded_at: now - 10.seconds, value: nil)

    get "/measurement_series", params: { q: { measurement_id: measurement.id, since: (now - 1.minute).iso8601, until: now.iso8601 }.to_json }

    expect(response).to have_http_status(:ok)
    series = response.parsed_body.fetch("measurement_series").sole
    expect(series.fetch("points").map { |point| [ point.fetch("precision"), point["value"] ] }).to eq([ [ "exact", 7 ], [ "exact", nil ] ])
  end

  it "returns bounded aggregate points from measurement rollups for a broad range" do
    now = Time.current.change(usec: 0)
    start = (now - 2.days).beginning_of_hour
    10.times do |minute|
      MeasurementRollup.create!(measurement: measurement, bucket_start: (start + minute.minutes).beginning_of_minute,
        sample_count: 2, stats: { "number" => { "min" => minute, "max" => minute + 2, "mean" => minute + 1, "count" => 2 }, "null_count" => 0 })
    end

    get "/measurement_series", params: { q: { measurement_id: measurement.id, since: start.iso8601, until: now.iso8601, max_points: 200 }.to_json }

    expect(response).to have_http_status(:ok)
    points = response.parsed_body.fetch("measurement_series").sole.fetch("points")
    expect(points.length).to be <= 200
    expect(points.first.fetch("precision")).to eq("rollup")
    expect(points.first.fetch("stats").fetch("number")).to include("min" => 0, "max" => 11, "mean" => 5.5, "count" => 20)
  end

  it "keeps the recent exact tail within the requested point budget" do
    now = Time.current.change(usec: 0)
    start = now - 2.hours
    rollups = 120.times.map do |minute|
      { measurement_id: measurement.id, bucket_start: (start + minute.minutes).beginning_of_minute,
        sample_count: 1, stats: { "number" => { "min" => minute, "max" => minute, "mean" => minute, "count" => 1 }, "null_count" => 0 } }
    end.uniq { |row| row.fetch(:bucket_start) }
    MeasurementRollup.insert_all!(rollups)
    samples = 150.times.map do |index|
      { measurement_id: measurement.id, recorded_at: now - (150 - index) * 0.2.seconds, value: index }
    end
    MeasurementSample.insert_all!(samples)

    get "/measurement_series", params: { q: { measurement_id: measurement.id, since: start.iso8601,
      until: now.iso8601, max_points: 100 }.to_json }

    expect(response).to have_http_status(:ok)
    points = response.parsed_body.fetch("measurement_series").sole.fetch("points")
    expect(points.length).to be <= 100
    expect(points.last).to include("precision" => "exact", "value" => 149)
    expect(points.first.fetch("precision")).to eq("rollup")
  end
end
