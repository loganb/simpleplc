require "rails_helper"

RSpec.describe Logic::OutputWriter do
  class WriterFakeDriver
    attr_reader :writes

    def initialize = @writes = []
    def open(channel) = @writes << [ :open, channel ]
    def close(channel) = @writes << [ :close, channel ]
  end

  let(:diagram) { LogicDiagram.create!(name: "Boiler", output_enable: true) }
  let(:host) { HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay board", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 3) }
  let(:output) do
    OutputBlock.create!(
      logic_diagram: diagram,
      name: "Boiler_Enable",
      device: device,
      channel: 2,
      input_expression: "true",
      output_enable: true
    )
  end

  it "collects enabled output commands from latest output data" do
    output
    Trace.create!(logic_diagram: diagram)

    commands = described_class.new.enabled_commands_by_device_id.fetch(device.id)

    expect(commands.size).to eq(1)
    expect(commands.first.output_block).to eq(output)
    expect(commands.first.channel).to eq(2)
    expect(commands.first.desired_output).to eq(true)
  end

  it "does not collect commands when diagram or output is disabled" do
    output
    Trace.create!(logic_diagram: diagram)

    output.update!(output_enable: false)
    expect(described_class.new.enabled_commands_by_device_id).to be_empty

    output.update!(output_enable: true)
    diagram.update!(output_enable: false)
    expect(described_class.new.enabled_commands_by_device_id).to be_empty
  end

  it "does not collect commands when the latest desired output is null" do
    output.update!(input_expression: "null")
    Trace.create!(logic_diagram: diagram)

    expect(output.reload.latest_result["value"]).to be_nil
    expect(described_class.new.enabled_commands_by_device_id).to be_empty
  end

  it "maps desired true to open and desired false to close on an existing driver" do
    driver = WriterFakeDriver.new
    writer = described_class.new

    writer.write(driver, described_class::Command.new(output_block: output, device: device, channel: 2, desired_output: true))
    writer.write(driver, described_class::Command.new(output_block: output, device: device, channel: 2, desired_output: false))

    expect(driver.writes).to eq([ [ :open, 2 ], [ :close, 2 ] ])
  end
end
