require "rails_helper"

RSpec.describe Logic::MeasurementHistoryMaintenance do
  let(:measurement) { Measurement.create!(name: "Trend") }
  let(:now) { Time.utc(2026, 10, 21, 12, 0, 30) }

  def sample(at, value)
    MeasurementSample.create!(measurement: measurement, recorded_at: at, value: value)
  end

  it "summarizes complete minutes and keeps numeric, boolean and null values" do
    minute = now - 3.minutes
    sample(minute, 10)
    sample(minute + 1.second, nil)
    sample(minute + 2.seconds, 20)
    sample(minute + 3.seconds, true)
    sample(minute + 4.seconds, false)
    sample(now, 99)

    described_class.new.run(now: now)

    rollup = measurement.measurement_rollups.sole
    expect(rollup.sample_count).to eq(5)
    expect(rollup.stats).to include("null_count" => 1)
    expect(rollup.stats.fetch("number")).to include("min" => 10, "max" => 20, "mean" => 15.0, "count" => 2)
    expect(rollup.stats.fetch("boolean")).to include("true_fraction" => 0.5, "transitions" => 1, "count" => 2)
  end

  it "prunes raw data after 48 hours only when rolled up and prunes rollups after two years" do
    old = now - 49.hours
    sample(old, 7)
    sample(now - 47.hours, 8)
    stale = MeasurementRollup.create!(measurement: measurement, bucket_start: now - 2.years - 1.day, sample_count: 1)

    described_class.new.run(now: now)

    expect(measurement.measurement_samples.pluck(:value)).to eq([ 8 ])
    expect(measurement.measurement_rollups).not_to include(stale)
    expect(measurement.measurement_rollups.where(bucket_start: old.beginning_of_minute)).to exist
  end

  it "keeps unrolled raw samples" do
    sample(now - 49.hours, 3)
    described_class.new.send(:prune_samples, measurement, now)
    expect(measurement.measurement_samples.count).to eq(1)
  end

  it "catches up a backlog in bounded passes before pruning its old samples" do
    stub_const("Logic::MeasurementHistoryMaintenance::MAX_ROLLUP_MINUTES", 1)
    old = now - 49.hours
    3.times { |minute| sample(old + minute.minutes, minute) }

    expect(described_class.new.run(now: now)).to be(true)
    expect(measurement.measurement_rollups.count).to eq(1)
    expect(measurement.measurement_samples.count).to eq(2)
    2.times { described_class.new.run(now: now) }
    expect(measurement.measurement_rollups.count).to eq(3)
    expect(measurement.measurement_samples.count).to eq(0)
  end
end
