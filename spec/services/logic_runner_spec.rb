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

  describe "#run" do
    it "stops its loop cleanly" do
      runner = described_class.new(sleeper: ->(_seconds) { runner.stop! })
      connection = instance_double(ActiveRecord::ConnectionAdapters::PostgreSQLAdapter)
      allow(connection).to receive(:select_value).and_return(true)
      allow(connection).to receive(:execute)
      allow(LogicInstance.connection_pool).to receive(:with_connection).and_yield(connection)
      allow(runner).to receive(:trap_signals)
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
