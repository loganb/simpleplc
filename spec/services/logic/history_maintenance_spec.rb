require "rails_helper"

RSpec.describe Logic::HistoryMaintenance do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Boiler room") }
  let(:now) { Time.utc(2026, 10, 13, 12, 0, 30) }

  # Raw rows with chosen values; the evaluator isn't what's under test here.
  def add_trace(at, temp: 1.0, ready: true, to: instance)
    Trace.insert_all([ {
      logic_instance_id: to.id, recorded_at: at, created_at: at, updated_at: at,
      results: { "schema_version" => 2,
                 "logic_inputs" => { "1" => { "value" => temp } },
                 "logic_blocks" => {},
                 "logic_outputs" => { "2" => { "value" => ready }, "3" => { "value" => nil } } }
    } ])
  end

  describe "rolling up" do
    it "summarizes each complete minute and leaves recent minutes alone" do
      add_trace(Time.utc(2026, 10, 13, 11, 58, 10), temp: 1.0, ready: true)
      add_trace(Time.utc(2026, 10, 13, 11, 58, 40), temp: 3.0, ready: false)
      add_trace(Time.utc(2026, 10, 13, 11, 59, 10))
      add_trace(Time.utc(2026, 10, 13, 12, 0, 10))

      described_class.new.run(now: now)

      rollup = TraceRollup.sole
      expect(rollup).to have_attributes(logic_instance_id: instance.id, bucket_start: Time.utc(2026, 10, 13, 11, 58), sample_count: 2)
      expect(rollup.results.dig("logic_inputs", "1")).to include("min" => 1.0, "max" => 3.0, "mean" => 2.0, "last" => 3.0, "count" => 2)
      expect(rollup.results.dig("logic_outputs", "2")).to include("true_fraction" => 0.5, "transitions" => 1, "last" => false)
      expect(rollup.results.dig("logic_outputs", "3")).to eq("null_count" => 2)
    end

    it "continues after the newest rollup, skips empty minutes, and never duplicates" do
      add_trace(Time.utc(2026, 10, 13, 11, 50, 5))
      described_class.new.run(now: now)
      add_trace(Time.utc(2026, 10, 13, 11, 55, 5))
      add_trace(Time.utc(2026, 10, 13, 11, 55, 6))
      described_class.new.run(now: now)
      described_class.new.run(now: now)

      expect(TraceRollup.order(:bucket_start).pluck(:bucket_start, :sample_count)).to eq([
        [ Time.utc(2026, 10, 13, 11, 50), 1 ], [ Time.utc(2026, 10, 13, 11, 55), 2 ]
      ])
    end

    it "limits each pass and reports a backlog until caught up" do
      stub_const("Logic::HistoryMaintenance::MAX_ROLLUP_MINUTES", 2)
      (0..4).each { |minute| add_trace(Time.utc(2026, 10, 13, 11, 40 + minute, 1)) }

      expect(described_class.new.run(now: now)).to be(true)
      expect(TraceRollup.count).to eq(2)
      described_class.new.run(now: now)
      expect(described_class.new.run(now: now)).to be(false)
      expect(TraceRollup.count).to eq(5)
    end

    it "rolls up each instance separately" do
      other = LogicInstance.create!(logic_diagram: diagram, name: "Other room")
      add_trace(Time.utc(2026, 10, 13, 11, 50, 5))
      add_trace(Time.utc(2026, 10, 13, 11, 51, 5), to: other)

      described_class.new.run(now: now)

      expect(TraceRollup.pluck(:logic_instance_id, :bucket_start)).to contain_exactly(
        [ instance.id, Time.utc(2026, 10, 13, 11, 50) ], [ other.id, Time.utc(2026, 10, 13, 11, 51) ]
      )
    end
  end

  describe "pruning raw traces" do
    let(:old) { now - 49.hours }

    it "deletes rolled-up traces past retention and keeps newer ones" do
      add_trace(old)
      add_trace(old + 20.seconds)
      add_trace(now - 47.hours)

      described_class.new.run(now: now)

      expect(Trace.pluck(:recorded_at)).to eq([ now - 47.hours ])
      expect(TraceRollup.where(bucket_start: old.beginning_of_minute).sole.sample_count).to eq(2)
    end

    it "never deletes a minute that has not been rolled up" do
      add_trace(old)

      described_class.new.send(:prune_traces, instance, now)

      expect(Trace.count).to eq(1)
    end

    it "does not prune past the rolled-up horizon while rollup is behind" do
      stub_const("Logic::HistoryMaintenance::MAX_ROLLUP_MINUTES", 1)
      3.times { |minute| add_trace(old + minute.minutes) }

      expect(described_class.new.run(now: now)).to be(true)
      expect(Trace.count).to eq(2)
      expect(TraceRollup.count).to eq(1)

      described_class.new.run(now: now)
      described_class.new.run(now: now)
      expect(Trace.count).to eq(0)
      expect(TraceRollup.count).to eq(3)
    end

    it "deletes in batches and reports a backlog at the cap" do
      stub_const("Logic::HistoryMaintenance::PRUNE_BATCH", 2)
      stub_const("Logic::HistoryMaintenance::MAX_PRUNE_BATCHES", 2)
      5.times { |second| add_trace(old + second.seconds) }

      expect(described_class.new.run(now: now)).to be(true)
      expect(Trace.count).to eq(1)
      expect(described_class.new.run(now: now)).to be(false)
      expect(Trace.count).to eq(0)
    end
  end

  describe "pruning rollups" do
    it "deletes rollups older than two years" do
      TraceRollup.create!(logic_instance: instance, bucket_start: now - 2.years - 1.day, sample_count: 1)
      kept = TraceRollup.create!(logic_instance: instance, bucket_start: now - 2.years + 1.day, sample_count: 1)

      described_class.new.run(now: now)

      expect(TraceRollup.all).to contain_exactly(kept)
    end
  end

  it "commits asynchronously" do
    add_trace(now - 5.minutes)
    seen = []
    allow(TraceRollup).to receive(:insert_all).and_wrap_original do |original, *args, **kwargs|
      seen << ActiveRecord::Base.connection.select_value("SHOW synchronous_commit")
      original.call(*args, **kwargs)
    end

    described_class.new.run(now: now)

    expect(seen).to eq([ "off" ])
  end
end
