require "rails_helper"

RSpec.describe Logic::HistoryMaintenance do
  it "groups typed sources per minute and retains detached history" do
    measurement = Measurement.create!(name: "History")
    time = 3.days.ago.beginning_of_minute
    snapshots = [
      { "source_id" => 1, "source_type" => "LogicInput", "value_type" => "number", "value" => 2 },
      { "source_id" => 1, "source_type" => "LogicInput", "value_type" => "number", "value" => 4 },
      { "source_id" => 2, "source_type" => "LogicOutput", "value_type" => "boolean", "value" => false }
    ]
    snapshots.each_with_index { |snapshot, i| MeasurementSample.create!(measurement: measurement, recorded_at: time + i.seconds, snapshot: snapshot) }
    described_class.new.run
    rollup = measurement.measurement_rollups.sole
    expect(rollup.sample_count).to eq(3)
    expect(rollup.summaries.find { |group| group["value_type"] == "number" }.fetch("statistics")).to include("mean" => 3.0, "count" => 2)
    expect(rollup.summaries.find { |group| group["value_type"] == "boolean" }.fetch("statistics")).to include("last" => false)
    expect(measurement.measurement_samples).to be_empty
  end
end

RSpec.describe "Late measurement samples" do
  it "summarizes late points separately before pruning them" do
    measurement = Measurement.create!(name: "Late history")
    time = 3.days.ago.beginning_of_minute
    MeasurementSample.create!(measurement: measurement, recorded_at: time, snapshot: { value: 1 })
    maintenance = Logic::HistoryMaintenance.new
    maintenance.run
    late = MeasurementSample.create!(measurement: measurement, recorded_at: time + 1.second, snapshot: { value: 2 })
    maintenance.run
    expect(MeasurementSample.exists?(late.id)).to be(false)
    rollup = measurement.measurement_rollups.sole
    expect(rollup.sample_count).to eq(2)
    expect(rollup.summaries.size).to eq(2)
    expect(rollup.summaries.last).to include("late" => true, "statistics" => include("last" => 2))
  end

  it "honors the grace period and expires detached raw and summarized history" do
    measurement = Measurement.create!(name: "Detached retention")
    now = Time.utc(2026, 10, 29, 12, 0)
    recent = MeasurementSample.create!(measurement: measurement, recorded_at: now - 30.seconds, snapshot: { value: nil })
    old = MeasurementSample.create!(measurement: measurement, recorded_at: now - 49.hours, snapshot: { value: false })
    expired = MeasurementRollup.create!(measurement: measurement, bucket_start: now - 3.years, sample_count: 1, summaries: [])
    Logic::HistoryMaintenance.new.run(now: now)
    expect(recent.reload.rolled_up).to be(false)
    expect(MeasurementSample.exists?(old.id)).to be(false)
    expect(MeasurementRollup.exists?(expired.id)).to be(false)
    expect(measurement.measurement_rollups.sole.summaries.first.fetch("statistics")).to include("last" => false, "count" => 1)
  end

  it "skips a measurement deleted after maintenance enumerated it" do
    measurement = Measurement.create!(name: "Deleted during maintenance")
    Measurement.find(measurement.id).destroy!

    expect(Logic::HistoryMaintenance.new.send(:roll_up_measurement, measurement, Time.current)).to be(false)
  end
end
