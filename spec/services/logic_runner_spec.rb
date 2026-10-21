require "rails_helper"

RSpec.describe LogicRunner do
  let(:now) { Time.zone.parse("2026-09-28 12:00:00") }

  describe "#run_cycle" do
    it "schedules instances independently and ignores definitions without instances" do
      fast_diagram = LogicDiagram.create!(name: "Fast definition")
      slow_diagram = LogicDiagram.create!(name: "Slow definition")
      LogicDiagram.create!(name: "Unused definition")
      fast = LogicInstance.create!(logic_diagram: fast_diagram, name: "Fast", update_period: 10)
      slow = LogicInstance.create!(logic_diagram: slow_diagram, name: "Slow", update_period: 60)
      Trace.create!(logic_instance: fast, recorded_at: now - 10.seconds)
      Trace.create!(logic_instance: slow, recorded_at: now - 10.seconds)

      described_class.new.run_cycle(now: now)

      expect(fast.traces.order(:id).last.recorded_at).to eq(now)
      expect(slow.traces.count).to eq(1)
      expect(Trace.count).to eq(3)
    end

    it "continues after one instance fails and throttles its retry" do
      diagram = LogicDiagram.create!(name: "Definition")
      broken = LogicInstance.create!(logic_diagram: diagram, name: "Broken")
      healthy = LogicInstance.create!(logic_diagram: diagram, name: "Healthy")
      runner = described_class.new
      allow(Logic::InstanceEvaluator).to receive(:evaluate!).and_call_original
      allow(Logic::InstanceEvaluator).to receive(:evaluate!).with(broken, recorded_at: now)
        .and_raise(StandardError, "bad instance")
      allow(Rails.logger).to receive(:error)

      runner.run_cycle(now: now)
      runner.run_cycle(now: now + described_class::ERROR_RETRY_INTERVAL - 1.second)

      expect(Logic::InstanceEvaluator).to have_received(:evaluate!).with(broken, recorded_at: now).once
      expect(healthy.traces.count).to eq(1)
    end

    it "evaluates new and edited instances immediately without backfilling missed periods" do
      diagram = LogicDiagram.create!(name: "Dynamic definition")
      runner = described_class.new
      changed = LogicInstance.create!(logic_diagram: diagram, name: "Changed", update_period: 60)
      old = LogicInstance.create!(logic_diagram: diagram, name: "Old", update_period: 10)
      Trace.create!(logic_instance: changed, recorded_at: now - 10.seconds)
      Trace.create!(logic_instance: old, recorded_at: now - 1.hour)

      changed.update!(update_period: 10)
      old.destroy!
      added = LogicInstance.create!(logic_diagram: diagram, name: "Added", update_period: 60)
      runner.run_cycle(now: now)

      expect(changed.traces.order(:id).last.recorded_at).to eq(now)
      expect(added.traces.count).to eq(1)
      expect(added.traces.last.recorded_at).to eq(now)
      expect(Trace.where(logic_instance_id: old.id)).to be_empty
    end

    it "retries a failed instance after the retry interval" do
      diagram = LogicDiagram.create!(name: "Retry definition")
      instance = LogicInstance.create!(logic_diagram: diagram, name: "Retry instance")
      runner = described_class.new
      allow(Logic::InstanceEvaluator).to receive(:evaluate!).and_raise(StandardError, "bad instance")
      allow(Rails.logger).to receive(:error)

      runner.run_cycle(now: now)
      runner.run_cycle(now: now + described_class::ERROR_RETRY_INTERVAL)

      expect(Logic::InstanceEvaluator).to have_received(:evaluate!).with(instance, anything).twice
    end
  end

  describe "scheduling" do
    let(:t0) { Time.utc(2026, 10, 13, 12) }
    let(:diagram) { LogicDiagram.create!(name: "Fast definition") }
    let!(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Fast", update_period: 1) }

    it "keeps a one-second grid despite late cycles, without drifting" do
      runner = described_class.new

      runner.run_cycle(now: t0)
      runner.run_cycle(now: t0 + 0.4)
      expect(instance.traces.count).to eq(1)

      runner.run_cycle(now: t0 + 1.1) # late by 0.1s
      expect(instance.traces.count).to eq(2)

      runner.run_cycle(now: t0 + 1.9) # the next slot is t0 + 2, not t0 + 2.1
      expect(instance.traces.count).to eq(2)
      runner.run_cycle(now: t0 + 2.05)
      expect(instance.traces.count).to eq(3)
    end

    it "skips ahead after a stall instead of catching up" do
      runner = described_class.new

      runner.run_cycle(now: t0)
      runner.run_cycle(now: t0 + 10.5)
      runner.run_cycle(now: t0 + 10.9)
      expect(instance.traces.count).to eq(2)

      runner.run_cycle(now: t0 + 11.01)
      expect(instance.traces.count).to eq(3)
    end

    it "derives the schedule from the state row after a restart" do
      described_class.new.run_cycle(now: t0)

      restarted = described_class.new
      restarted.run_cycle(now: t0 + 0.5)
      expect(instance.traces.count).to eq(1)
      restarted.run_cycle(now: t0 + 1.0)
      expect(instance.traces.count).to eq(2)
    end

    it "sleeps until the earliest due instance, at most the check interval" do
      runner = described_class.new
      expect(runner.seconds_until_next_wakeup(t0)).to eq(described_class::CHECK_INTERVAL)

      runner.run_cycle(now: t0)

      expect(runner.seconds_until_next_wakeup(t0 + 0.25)).to be_within(0.001).of(0.75)
      expect(runner.seconds_until_next_wakeup(t0 + 2)).to eq(0)
      instance.update!(update_period: 60)
      runner.run_cycle(now: t0 + 3)
      expect(runner.seconds_until_next_wakeup(t0 + 3.1)).to eq(described_class::CHECK_INTERVAL)
    end

    it "waits out a failed instance's retry delay rather than spinning" do
      runner = described_class.new
      runner.run_cycle(now: t0)
      allow(Logic::InstanceEvaluator).to receive(:evaluate!).and_raise(StandardError, "bad instance")
      allow(Rails.logger).to receive(:error)
      runner.run_cycle(now: t0 + 1)

      expect(runner.seconds_until_next_wakeup(t0 + 1.1)).to eq(described_class::CHECK_INTERVAL)
    end
  end

  describe "history maintenance" do
    it "runs at most once a minute, sooner while there is a backlog" do
      runner = described_class.new
      maintenance = instance_double(Logic::HistoryMaintenance)
      allow(Logic::HistoryMaintenance).to receive(:new).and_return(maintenance)
      allow(maintenance).to receive(:run).and_return(true, false, false)

      runner.maintain_if_due(now: now)
      runner.maintain_if_due(now: now + 0.5)
      expect(maintenance).to have_received(:run).once
      runner.maintain_if_due(now: now + 1)
      runner.maintain_if_due(now: now + 30)
      expect(maintenance).to have_received(:run).twice
      runner.maintain_if_due(now: now + 61)
      expect(maintenance).to have_received(:run).exactly(3).times
    end

    it "logs a failure and keeps going" do
      runner = described_class.new
      allow(Logic::HistoryMaintenance).to receive(:new).and_raise(StandardError, "boom")
      allow(Rails.logger).to receive(:error)

      expect { runner.maintain_if_due(now: now) }.not_to raise_error
      expect(Rails.logger).to have_received(:error).with(/history maintenance failed: StandardError: boom/)
    end
  end

  describe "commit durability" do
    let(:diagram) { LogicDiagram.create!(name: "Durability definition") }
    let!(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Durable") }

    def record_commit_mode
      modes = []
      allow(Logic::TraceEvaluator).to receive(:evaluate!).and_wrap_original do |original, *args|
        modes << ActiveRecord::Base.connection.select_value("SHOW synchronous_commit")
        original.call(*args)
      end
      modes
    end

    it "commits runner evaluations asynchronously" do
      modes = record_commit_mode

      described_class.new.run_cycle(now: now)

      expect(modes).to eq([ "off" ])
    end

    it "keeps web-initiated traces synchronous" do
      modes = record_commit_mode

      Trace.create!(logic_instance: instance)

      expect(modes).to eq([ "on" ])
    end
  end

  describe "#run" do
    it "stops its loop cleanly" do
      runner = described_class.new(sleeper: ->(_seconds) { runner.stop! })
      connection = instance_double(ActiveRecord::ConnectionAdapters::PostgreSQLAdapter)
      allow(connection).to receive(:select_value).and_return(true)
      allow(connection).to receive(:execute)
      allow(LogicInstance.connection_pool).to receive(:with_connection).and_yield(connection)
      allow(runner).to receive(:trap_signals)
      allow(runner).to receive(:maintain_if_due)
      expect(runner).to receive(:run_cycle).once
      runner.run
      expect(connection).to have_received(:execute).with(/pg_advisory_unlock/)
    end

    it "refuses to run when another runner holds the advisory lock" do
      connection = instance_double(ActiveRecord::ConnectionAdapters::PostgreSQLAdapter)
      allow(connection).to receive(:select_value).and_return(false)
      allow(LogicInstance.connection_pool).to receive(:with_connection).and_yield(connection)

      expect { described_class.new.run }.to raise_error(LogicRunner::AlreadyRunning)
    end
  end

  it "produces output commands through a runner-created instance trace" do
    diagram = LogicDiagram.create!(name: "Output definition")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Output instance", output_enable: true)
    host = HostInterface.create!(name: "Output Bus", port: "/dev/ttyUSB2")
    device = Device.create!(name: "Output Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1)
    output = LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "true")
    binding = LogicOutputBinding.create!(logic_instance: instance, logic_output: output, device: device, channel: 2)

    described_class.new.run_cycle(now: now)
    command = Logic::OutputWriter.new.enabled_commands_by_device_id.fetch(device.id).sole

    expect(command).to have_attributes(output_binding: binding, channel: 2, desired_output: true)
  end
end
