require "rails_helper"

RSpec.describe LogicRunner do
  let(:now) { Time.zone.parse("2026-09-28 12:00:00") }

  describe "#run_cycle" do
    it "immediately evaluates a diagram without a trace" do
      diagram = LogicDiagram.create!(name: "Boiler", update_period: 60)

      expect { described_class.new.run_cycle(now: now) }
        .to change { diagram.traces.count }.from(0).to(1)
      expect(diagram.traces.last.recorded_at).to eq(now)
    end

    it "waits until the update period has elapsed" do
      due = LogicDiagram.create!(name: "Due", update_period: 60)
      waiting = LogicDiagram.create!(name: "Waiting", update_period: 60)
      Trace.create!(logic_diagram: due, recorded_at: now - 60.seconds)
      Trace.create!(logic_diagram: waiting, recorded_at: now - 59.seconds)

      expect { described_class.new.run_cycle(now: now) }
        .to change { due.traces.count }.by(1)
      expect(waiting.traces.count).to eq(1)
    end

    it "schedules diagrams independently" do
      fast = LogicDiagram.create!(name: "Fast", update_period: 10)
      slow = LogicDiagram.create!(name: "Slow", update_period: 60)
      Trace.create!(logic_diagram: fast, recorded_at: now - 10.seconds)
      Trace.create!(logic_diagram: slow, recorded_at: now - 10.seconds)

      described_class.new.run_cycle(now: now)

      expect(fast.traces.order(:id).last.recorded_at).to eq(now)
      expect(slow.traces.count).to eq(1)
    end

    it "creates one current trace instead of backfilling missed periods" do
      diagram = LogicDiagram.create!(name: "Boiler", update_period: 10)
      Trace.create!(logic_diagram: diagram, recorded_at: now - 1.hour)

      expect { described_class.new.run_cycle(now: now) }
        .to change { diagram.traces.count }.by(1)
      expect(diagram.traces.order(:id).last.recorded_at).to eq(now)
    end

    it "uses a manual newer trace to postpone the next scheduled evaluation" do
      diagram = LogicDiagram.create!(name: "Boiler", update_period: 60)
      Trace.create!(logic_diagram: diagram, recorded_at: now - 10.seconds)

      expect { described_class.new.run_cycle(now: now) }
        .not_to change { diagram.traces.count }
    end

    it "observes new diagrams, deleted diagrams, and update-period edits each pass" do
      runner = described_class.new
      changed = LogicDiagram.create!(name: "Changed", update_period: 60)
      deleted = LogicDiagram.create!(name: "Deleted", update_period: 60)
      Trace.create!(logic_diagram: changed, recorded_at: now - 10.seconds)
      Trace.create!(logic_diagram: deleted, recorded_at: now - 1.hour)

      changed.update!(update_period: 10)
      deleted.destroy!
      added = LogicDiagram.create!(name: "Added", update_period: 60)
      runner.run_cycle(now: now)

      expect(changed.traces.order(:id).last.recorded_at).to eq(now)
      expect(added.traces.order(:id).last.recorded_at).to eq(now)
      expect(Trace.where(logic_diagram_id: deleted.id)).to be_empty
    end

    it "continues after one diagram fails and throttles its retry" do
      broken = LogicDiagram.create!(name: "Broken", update_period: 60)
      healthy = LogicDiagram.create!(name: "Healthy", update_period: 60)
      runner = described_class.new
      allow(Logic::DiagramEvaluator).to receive(:evaluate!).and_call_original
      allow(Logic::DiagramEvaluator).to receive(:evaluate!).with(broken, recorded_at: now)
        .and_raise(StandardError, "bad diagram")

      expect(Rails.logger).to receive(:error).with(/LogicRunner.*Broken.*bad diagram/).once
      runner.run_cycle(now: now)
      runner.run_cycle(now: now + described_class::ERROR_RETRY_INTERVAL - 1.second)

      expect(Logic::DiagramEvaluator).to have_received(:evaluate!).with(broken, recorded_at: now).once
      expect(healthy.traces.count).to eq(1)
    end

    it "retries a failed diagram after the retry interval" do
      diagram = LogicDiagram.create!(name: "Broken", update_period: 60)
      runner = described_class.new
      allow(Logic::DiagramEvaluator).to receive(:evaluate!).and_raise(StandardError, "bad diagram")
      allow(Rails.logger).to receive(:error)

      runner.run_cycle(now: now)
      runner.run_cycle(now: now + described_class::ERROR_RETRY_INTERVAL)

      expect(Logic::DiagramEvaluator).to have_received(:evaluate!).twice
    end
  end

  describe "#run" do
    it "stops its loop cleanly" do
      runner = described_class.new(sleeper: ->(_seconds) { runner.stop! })
      connection = instance_double(ActiveRecord::ConnectionAdapters::PostgreSQLAdapter)
      allow(connection).to receive(:select_value).and_return(true)
      allow(connection).to receive(:execute)
      allow(LogicDiagram.connection_pool).to receive(:with_connection).and_yield(connection)
      allow(runner).to receive(:trap_signals)

      expect(runner).to receive(:run_cycle).once
      runner.run

      expect(connection).to have_received(:execute).with(/pg_advisory_unlock/)
    end

    it "refuses to run when another runner holds the advisory lock" do
      connection = instance_double(ActiveRecord::ConnectionAdapters::PostgreSQLAdapter)
      allow(connection).to receive(:select_value).and_return(false)
      allow(LogicDiagram.connection_pool).to receive(:with_connection).and_yield(connection)

      expect { described_class.new.run }.to raise_error(LogicRunner::AlreadyRunning)
    end
  end

  it "produces output commands through a runner-created trace" do
    diagram = LogicDiagram.create!(name: "Boiler", update_period: 60, output_enable: true)
    host = HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0")
    device = Device.create!(name: "Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1)
    output = OutputBlock.create!(logic_diagram: diagram, name: "Heat", device: device,
      channel: 2, input_expression: "true", output_enable: true)

    described_class.new.run_cycle(now: now)
    command = Logic::OutputWriter.new.enabled_commands_by_device_id.fetch(device.id).sole

    expect(command).to have_attributes(output_block: output, channel: 2, desired_output: true)
  end
end
