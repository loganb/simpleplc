require "rails_helper"

RSpec.describe "Measurement history points", type: :request do
  let!(:measurement) { Measurement.create!(name: "Temperature") }
  let(:now) { Time.current.change(usec: 0) }
  let(:source) { { "source_type" => "LogicInput", "source_id" => 1, "value_type" => "number", "source_name" => "Temp" } }

  it "returns samples and reconstructs a point by its ID" do
    MeasurementSample.create!(measurement: measurement, recorded_at: now - 10, snapshot: source.merge("value" => 0))
    get "/measurement_history_points", params: { q: { measurement_ids: [ measurement.id ], since: (now - 60).iso8601, until: now.iso8601, target_points: 100 }.to_json }
    expect(response).to have_http_status(:ok)
    point = response.parsed_body.fetch("measurement_history_points").sole
    expect(point).to include("kind" => "sample", "value" => 0, "count" => 1)
    get "/measurement_history_points/#{point.fetch('id')}"
    expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(point)
  end

  it "rejects invalid budgets and missing measurements" do
    args = { measurement_ids: [ measurement.id ], since: (now - 60).iso8601, until: now.iso8601, target_points: 0 }
    get "/measurement_history_points", params: { q: args.to_json }
    expect(response).to have_http_status(:unprocessable_content)
    get "/measurement_history_points", params: { q: args.merge(measurement_ids: [ 999999 ], target_points: 1).to_json }
    expect(response).to have_http_status(:not_found)
  end
end

RSpec.describe "Aggregated measurement history", type: :request do
  let!(:measurement) { Measurement.create!(name: "History") }
  let(:minute) { 4.days.ago.beginning_of_minute }
  let(:source) { { "logic_instance_id" => 1, "logic_diagram_id" => 2, "source_type" => "LogicInput", "source_id" => 3, "value_type" => "number", "logic_instance_name" => "Room", "logic_diagram_name" => "Boiler", "source_name" => "Temp" } }

  def query(from, to, target = 1)
    get "/measurement_history_points", params: { q: { measurement_ids: [ measurement.id ], since: from.iso8601(6), until: to.iso8601(6), target_points: target }.to_json }
    expect(response).to have_http_status(:ok)
    response.parsed_body.fetch("measurement_history_points", [])
  end

  it "weights late summaries, adds unrolled data, and reconstructs the bucket" do
    MeasurementRollup.create!(measurement: measurement, bucket_start: minute, sample_count: 150, summaries: [
      source.merge("statistics" => { "count" => 120, "mean" => 10, "min" => 8, "max" => 12 }),
      source.merge("late" => true, "statistics" => { "count" => 30, "mean" => 20, "min" => 18, "max" => 22 })
    ])
    MeasurementSample.create!(measurement: measurement, recorded_at: minute + 30, snapshot: source.merge("value" => nil))
    point = query(minute, minute + 60).sole
    expect(point).to include("count" => 150, "null_count" => 1, "coverage" => "mixed", "last_known" => false)
    expect(point.fetch("statistics")).to include("mean" => 12.0, "min" => 8, "max" => 22, "last" => nil)
    get "/measurement_history_points/#{point.fetch('id')}"
    expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(point)
  end

  it "exposes a complete historical minute for an incomplete clipped boundary" do
    MeasurementRollup.create!(measurement: measurement, bucket_start: minute, sample_count: 2,
      summaries: [ source.merge("statistics" => { "count" => 2, "mean" => 2, "min" => 1, "max" => 3 }) ])
    point = query(minute + 15, minute + 45).sole
    expect(point).to include("start" => minute.iso8601(6), "end" => (minute + 60).iso8601(6), "count" => 2)
    get "/measurement_history_points/#{point.fetch('id')}"
    expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(point)
  end

  it "returns 404 for malformed and unknown IDs" do
    [ "mhp1_W10", "mhp1_WyJ4Il0", "mhp1_aGVsbG8", "bad" ].each do |id|
      get "/measurement_history_points/#{id}"
      expect(response).to have_http_status(:not_found)
    end
  end
end

RSpec.describe "History tier merging", type: :request do
  let!(:measurement) { Measurement.create!(name: "History") }
  let(:minute) { 1.hour.ago.beginning_of_minute }
  let(:source) { { "source_type" => "LogicInput", "source_id" => 1, "value_type" => "boolean", "source_name" => "Ready" } }
  def history(from, to, budget = 1)
    get "/measurement_history_points", params: { q: { measurement_ids: [ measurement.id ], since: from.iso8601(6), until: to.iso8601(6), target_points: budget }.to_json }
    expect(response).to have_http_status(:ok)
    response.parsed_body.fetch("measurement_history_points", [])
  end
  it "uses complete raw data for a clipped minute without duplicating the rollup" do
    MeasurementRollup.create!(measurement: measurement, bucket_start: minute, sample_count: 3,
      summaries: [ source.merge("statistics" => { "count" => 3, "true_fraction" => 0.6666666667 }) ])
    MeasurementSample.create!(measurement: measurement, recorded_at: minute + 10, rolled_up: true, snapshot: source.merge("value" => true))
    MeasurementSample.create!(measurement: measurement, recorded_at: minute + 20, rolled_up: true, snapshot: source.merge("value" => true))
    MeasurementSample.create!(measurement: measurement, recorded_at: minute + 40, rolled_up: true, snapshot: source.merge("value" => false))
    points = history(minute + 5, minute + 35, 1)
    expect(points.sole).to include("count" => 2, "coverage" => "raw", "statistics" => include("true_fraction" => 1.0))
    get "/measurement_history_points/#{points.sole.fetch('id')}"
    expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(points.sole)
  end
  it "weights boolean summaries and keeps renamed source groups separate" do
    MeasurementRollup.create!(measurement: measurement, bucket_start: minute, sample_count: 5, summaries: [
      source.merge("statistics" => { "count" => 3, "true_fraction" => 1.0 }),
      source.merge("late" => true, "statistics" => { "count" => 1, "true_fraction" => 0.0 }),
      source.merge("source_name" => "Renamed", "statistics" => { "count" => 1, "true_fraction" => 0.0 })
    ])
    points = history(minute, minute + 60)
    expect(points.size).to eq(2)
    expect(points.find { |p| p.dig("source", "source_name") == "Ready" }.dig("statistics", "true_fraction")).to eq(0.75)
    points.each do |point|
      get "/measurement_history_points/#{point.fetch('id')}"
      expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(point)
    end
  end
  it "returns every sample and rollup without a default or maximum listing cap" do
    rows = 1001.times.map { |i| { measurement_id: measurement.id, recorded_at: minute + i, snapshot: source, created_at: minute, updated_at: minute } }
    MeasurementSample.insert_all!(rows)
    rolls = 1001.times.map { |i| { measurement_id: measurement.id, bucket_start: minute + i.minutes, sample_count: 1, summaries: [], created_at: minute, updated_at: minute } }
    MeasurementRollup.insert_all!(rolls)
    %w[measurement_samples measurement_rollups].each do |resource|
      get "/#{resource}", params: { q: { measurement_id: measurement.id }.to_json }
      expect(response.parsed_body.fetch(resource).size).to eq(1001)
    end
  end
end

RSpec.describe "Multi-bucket history", type: :request do
  it "preserves nonaligned boundaries, types, and represented samples without double counting" do
    measurement = Measurement.create!(name: "Multi bucket")
    minute = 4.days.ago.beginning_of_minute
    number = { "source_type" => "LogicInput", "source_id" => 1, "value_type" => "number", "source_name" => "Value" }
    boolean = number.merge("value_type" => "boolean")
    4.times do |i|
      snapshot = i == 2 ? boolean : number
      statistics = i == 2 ? { "count" => 1, "true_fraction" => 0.0 } : { "count" => 1, "min" => i, "max" => i, "mean" => i }
      MeasurementRollup.create!(measurement: measurement, bucket_start: minute + i.minutes, sample_count: 1, summaries: [ snapshot.merge("statistics" => statistics) ])
      MeasurementSample.create!(measurement: measurement, recorded_at: minute + i.minutes + 10, snapshot: snapshot.merge("value" => i == 2 ? false : i), rolled_up: true)
    end
    get "/measurement_history_points", params: { q: { measurement_ids: [ measurement.id ], since: (minute + 15).iso8601, until: (minute + 225).iso8601, target_points: 2 }.to_json }
    expect(response).to have_http_status(:ok)
    points = response.parsed_body.fetch("measurement_history_points")
    expect(points.sum { |point| point.fetch("count") }).to eq(3)
    expect(points.map { |point| point.dig("source", "value_type") }).to include("number", "boolean")
    points.each do |point|
      get "/measurement_history_points/#{point.fetch('id')}"
      expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(point)
    end
  end
end

RSpec.describe "History validation", type: :request do
  let!(:measurement) { Measurement.create!(name: "Validation") }
  let(:now) { Time.current.change(usec: 0) }
  it "returns an empty query with metadata for an empty selection" do
    get "/measurement_history_points", params: { q: { measurement_ids: [], since: (now - 60).iso8601, until: now.iso8601, target_points: 10 }.to_json }
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("query" => [], "metadata" => include("series" => [], "target_points" => 10))
  end
  it "rejects invalid ranges and keeps history points read only" do
    args = { measurement_ids: [ measurement.id ], since: now.iso8601, until: now.iso8601, target_points: 1 }
    get "/measurement_history_points", params: { q: args.to_json }
    expect(response).to have_http_status(:unprocessable_content)
    post "/measurement_history_points", params: {}
    expect(response).to have_http_status(:not_found)
    patch "/measurement_history_points/mhp1_W10", params: {}
    expect(response).to have_http_status(:not_found)
  end
  it "rejects invalid explicit listing limits without imposing a maximum" do
    %w[measurement_samples measurement_rollups].each do |resource|
      [ -1, 0, 1.5, "bad" ].each do |limit|
        get "/#{resource}", params: { q: { measurement_id: measurement.id, limit: limit }.to_json }
        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end
end

RSpec.describe "Historical edge support", type: :request do
  it "separates incomplete first and last minute summaries from coarse buckets" do
    measurement = Measurement.create!(name: "Partial edges")
    minute = 4.days.ago.beginning_of_hour
    source = { "source_type" => "LogicInput", "source_id" => 1, "value_type" => "number", "source_name" => "Value" }
    [ 0, 1, 2, 3, 4, 5 ].each do |i|
      MeasurementRollup.create!(measurement: measurement, bucket_start: minute + i.minutes, sample_count: 2,
        summaries: [ source.merge("statistics" => { "count" => 2, "mean" => i, "min" => i, "max" => i }) ])
      # Only one of two represented samples survives in each boundary minute.
      MeasurementSample.create!(measurement: measurement, recorded_at: minute + i.minutes + 20, rolled_up: true, snapshot: source.merge("value" => i)) if [ 0, 5 ].include?(i)
    end
    get "/measurement_history_points", params: { q: { measurement_ids: [ measurement.id ], since: (minute + 10).iso8601, until: (minute + 5.minutes + 50).iso8601, target_points: 2 }.to_json }
    expect(response).to have_http_status(:ok)
    points = response.parsed_body.fetch("measurement_history_points").sort_by { |p| p.fetch("start") }
    expect(points.sum { |p| p.fetch("count") }).to eq(12)
    points.each_cons(2) { |a, b| expect(a.fetch("end")).to be <= b.fetch("start") }
    points.each do |point|
      get "/measurement_history_points/#{point.fetch('id')}"
      expect(response.parsed_body.fetch("measurement_history_points").sole).to eq(point)
    end
  end
end
