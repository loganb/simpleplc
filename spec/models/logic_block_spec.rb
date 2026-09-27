require "rails_helper"

RSpec.describe LogicBlock, type: :model do
  let(:diagram) { LogicDiagram.create!(name: "Boiler") }

  def measurement
    host = HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0")
    device = Device.create!(name: "Temp board", host_interface: host, driver: "Drivers::N4DSC08", modbus_address: 1)
    Measurement.create!(logic_diagram: diagram, name: "DHW_Temp", device: device, source_path: "temperatures[0]")
  end

  it "accepts a valid hysteresis block" do
    m = measurement
    block = HysteresisLogicBlock.new(
      logic_diagram: diagram,
      name: "DHW_Call",
      stratum: 1,
      input_expressions: {
        "value" => "DHW_Temp",
        "low_limit" => "140",
        "high_limit" => "160"
      },
      config: { "mode" => "active_low" }
    )

    expect(block).to be_valid
  end

  it "exposes hysteresis config through typed accessors" do
    block = HysteresisLogicBlock.new(config: { "mode" => "active_low", "initial_output" => true })

    expect(block.mode).to eq("active_low")
    expect(block).to be_active_low
    expect(block.initial_output).to eq(true)
  end

  it "exposes hysteresis latest input and output values" do
    block = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "BOT_Ready",
      stratum: 1,
      input_expressions: { "value" => "145", "low_limit" => "130", "high_limit" => "140" },
      config: { "mode" => "active_high" }
    )
    Trace.create!(logic_diagram: diagram, recorded_at: Time.zone.parse("2026-04-29 10:00:00"))

    expect(block.value).to eq(145.0)
    expect(block.low_limit).to eq(130.0)
    expect(block.high_limit).to eq(140.0)
    expect(block.output).to eq(true)
  end

  it "validates hysteresis mode" do
    block = HysteresisLogicBlock.new(
      logic_diagram: diagram,
      name: "Bad",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: { "mode" => "sideways" }
    )

    expect(block).not_to be_valid
    expect(block.errors[:config].join).to include("active_high or active_low")
  end

  it "rejects expression-unsafe names" do
    block = HysteresisLogicBlock.new(
      logic_diagram: diagram,
      name: "DHW Call",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )

    expect(block).not_to be_valid
    expect(block.errors[:name].join).to include("expression-safe identifier")
  end

  it "exposes latch config through typed accessors" do
    block = LatchLogicBlock.new(config: { "mode" => "latch_low", "dominance" => "set", "initial_output" => false })

    expect(block.mode).to eq("latch_low")
    expect(block).not_to be_latch_high
    expect(block.dominance).to eq("set")
    expect(block.initial_output).to eq(false)
  end

  it "exposes latch latest input and output values" do
    block = LatchLogicBlock.create!(
      logic_diagram: diagram,
      name: "Heat_Lockout",
      stratum: 1,
      input_expressions: { "set" => "true", "reset" => "false" },
      config: { "mode" => "latch_high", "dominance" => "reset" }
    )
    Trace.create!(logic_diagram: diagram, recorded_at: Time.zone.parse("2026-04-29 10:00:00"))

    expect(block.set).to eq(true)
    expect(block.reset).to eq(false)
    expect(block.output).to eq(true)
  end

  it "validates latch mode and dominance" do
    block = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Bad",
      stratum: 1,
      input_expressions: { "set" => "true", "reset" => "false" },
      config: { "mode" => "sticky", "dominance" => "maybe" }
    )

    expect(block).not_to be_valid
    expect(block.errors[:config].join).to include("latch_high or latch_low")
    expect(block.errors[:config].join).to include("reset or set")
  end

  it "rejects an unknown referenced name" do
    block = HysteresisLogicBlock.new(
      logic_diagram: diagram,
      name: "DHW_Call",
      stratum: 1,
      input_expressions: { "value" => "MissingMeasurement" },
      config: {}
    )

    expect(block).not_to be_valid
    expect(block.errors[:input_expressions].join).to include("unknown name MissingMeasurement")
  end

  it "rejects references to same-stratum or downstream blocks" do
    upstream = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "Upstream",
      stratum: 2,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )

    block = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Bad",
      stratum: 2,
      input_expressions: { "set" => "Upstream", "reset" => "false" },
      config: {}
    )

    expect(block).not_to be_valid
    expect(block.errors[:input_expressions].join).to include("not upstream")
  end

  it "accepts upstream logic block references by name" do
    upstream = HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: "BOT_Ready",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )

    block = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Heat_Lockout",
      stratum: 2,
      input_expressions: { "set" => "BOT_Ready", "reset" => "false" },
      config: {}
    )

    expect(block).to be_valid
    expect(upstream).to be_persisted
  end

  it "rejects ambiguous name references" do
    m = measurement
    HysteresisLogicBlock.create!(
      logic_diagram: diagram,
      name: m.name,
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )

    block = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Ambiguous",
      stratum: 2,
      input_expressions: { "set" => m.name, "reset" => "false" },
      config: {}
    )

    expect(block).not_to be_valid
    expect(block.errors[:input_expressions].join).to include("ambiguous")
  end

  it "treats cross-diagram block names as unknown" do
    other_diagram = LogicDiagram.create!(name: "Other")
    other_block = HysteresisLogicBlock.create!(
      logic_diagram: other_diagram,
      name: "Other",
      stratum: 1,
      input_expressions: { "value" => "1", "low_limit" => "0", "high_limit" => "1" },
      config: {}
    )

    block = LatchLogicBlock.new(
      logic_diagram: diagram,
      name: "Bad",
      stratum: 2,
      input_expressions: { "set" => "Other", "reset" => "false" },
      config: {}
    )

    expect(block).not_to be_valid
    expect(block.errors[:input_expressions].join).to include("unknown name Other")
  end
end
