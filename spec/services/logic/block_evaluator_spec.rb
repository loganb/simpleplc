require "rails_helper"

RSpec.describe Logic::BlockEvaluator do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  it "persists active-high hysteresis output, state, and input values" do
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "BOT_Ready",
      stratum: 1,
      input_expressions: { "value" => "145", "low_limit" => "130", "high_limit" => "140" },
      config: { "mode" => "active_high" }
    )
    trace = Trace.create!(logic_diagram: diagram, recorded_at: Time.zone.parse("2026-04-28 12:00:00"))

    datum = described_class.evaluate!(block, trace: trace)

    expect(datum.value).to eq(1.0)
    expect(datum.state).to include("output" => true)
    expect(datum.input_values).to include("value" => 145.0, "low_limit" => 130.0, "high_limit" => 140.0)
  end

  it "retains hysteresis output between limits from the latest datum" do
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Flow_Lockout",
      stratum: 1,
      input_expressions: { "value" => "0.9", "low_limit" => "0.8", "high_limit" => "1" },
      config: { "mode" => "active_high" }
    )
    previous_trace = Trace.create!(logic_diagram: diagram, recorded_at: 1.minute.ago)
    block.data.create!(trace: previous_trace, value: 1.0, state: { "output" => true }, input_values: {}, recorded_at: 1.minute.ago)
    trace = Trace.create!(logic_diagram: diagram)

    datum = described_class.evaluate!(block, trace: trace)

    expect(datum.value).to eq(1.0)
    expect(datum.state).to include("output" => true)
  end

  it "implements reset-dominant latch-high behavior" do
    block = LatchLogicBlock.create!(
      logic_diagram: diagram,
      name: "Heat_Lockout",
      stratum: 1,
      input_expressions: { "set" => "true", "reset" => "false" },
      config: { "mode" => "latch_high", "dominance" => "reset" }
    )
    first = described_class.evaluate!(block, trace: Trace.create!(logic_diagram: diagram))
    block.update!(input_expressions: { "set" => "false", "reset" => "false" })
    retained = described_class.evaluate!(block, trace: Trace.create!(logic_diagram: diagram))
    block.update!(input_expressions: { "set" => "false", "reset" => "true" })
    reset = described_class.evaluate!(block, trace: Trace.create!(logic_diagram: diagram))

    expect(first.value).to eq(1.0)
    expect(retained.value).to eq(1.0)
    expect(reset.value).to eq(0.0)
  end

  it "evaluates measurement and logic block references by name" do
    host = HostInterface.create!(port: "/dev/ttyUSB0")
    device = Device.create!(
      name: "Temp board",
      host_interface: host,
      driver: "n4dsc08",
      modbus_address: 1,
      current_state: {
        "status" => "ok",
        "data" => {
          "temperatures" => [ 145.0 ]
        }
      }
    )
    measurement = Measurement.create!(logic_diagram: diagram, name: "BoilerOutletTemp", device: device, source_path: "temperatures[0]")
    ready = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "BOT_Ready",
      stratum: 1,
      input_expressions: { "value" => "BoilerOutletTemp", "low_limit" => "130", "high_limit" => "140" },
      config: { "mode" => "active_high" }
    )
    lockout = LatchLogicBlock.create!(
      logic_diagram: diagram,
      name: "Heat_Lockout",
      stratum: 2,
      input_expressions: { "set" => "!BOT_Ready", "reset" => "false" },
      config: { "mode" => "latch_high", "dominance" => "reset" }
    )

    trace = Trace.create!(logic_diagram: diagram)
    described_class.evaluate!(ready, trace: trace)
    datum = described_class.evaluate!(lockout, trace: trace)

    expect(datum.input_values).to include("set" => false)
    expect(datum.value).to eq(0.0)
  end
end
