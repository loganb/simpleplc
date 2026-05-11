require "rails_helper"

RSpec.describe Logic::OutputEvaluator do
  let(:diagram) { LogicDiagram.create!(name: "Boiler", output_enable: true) }
  let(:host) { HostInterface.create!(port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay board", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 3) }

  it "records truthy desired output when both enables are true" do
    trace = Trace.create!(logic_diagram: diagram)
    output = OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "true",
      output_enable: true
    )

    datum = described_class.evaluate!(output, trace: trace)

    expect(datum.value).to eq(1.0)
    expect(datum.state).to include(
      "desired_output" => true,
      "effective_output" => true,
      "diagram_output_enable" => true,
      "output_enable" => true,
      "write_pending" => true
    )
  end

  it "records falsey desired output when both enables are true" do
    trace = Trace.create!(logic_diagram: diagram)
    output = OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "false",
      output_enable: true
    )

    datum = described_class.evaluate!(output, trace: trace)

    expect(datum.value).to eq(0.0)
    expect(datum.state).to include("desired_output" => false, "effective_output" => false)
  end

  it "records but skips writes when diagram output_enable is false" do
    diagram.update!(output_enable: false)
    trace = Trace.create!(logic_diagram: diagram)
    output = OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "true",
      output_enable: true
    )

    datum = described_class.evaluate!(output, trace: trace)

    expect(datum.state).to include(
      "desired_output" => true,
      "effective_output" => nil,
      "write_pending" => false,
      "write_skipped_reason" => "diagram_output_disabled"
    )
  end

  it "records but skips writes when output_enable is false" do
    trace = Trace.create!(logic_diagram: diagram)
    output = OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 1,
      input_expression: "true",
      output_enable: false
    )

    datum = described_class.evaluate!(output, trace: trace)

    expect(datum.state).to include(
      "desired_output" => true,
      "effective_output" => nil,
      "write_pending" => false,
      "write_skipped_reason" => "output_disabled"
    )
  end
end
