require "rails_helper"

RSpec.describe Logic::OutputWriter do
  class WriterFakeDriver
    attr_reader :writes
    def initialize = @writes = []
    def open(channel) = @writes << [ :open, channel ]
    def close(channel) = @writes << [ :close, channel ]
  end

  let(:diagram) { LogicDiagram.create!(name: "Boiler") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Boiler room", output_enable: true) }
  let(:host) { HostInterface.create!(name: "Test Bus", port: "/dev/ttyUSB0") }
  let(:device) { Device.create!(name: "Relay", host_interface: host, driver: "Drivers::N4D8B08", modbus_address: 1) }
  let(:output) { LogicOutput.create!(logic_diagram: diagram, name: "Heat", value_type: "boolean", input_expression: "true") }
  let(:binding) { LogicOutputBinding.create!(logic_instance: instance, logic_output: output, device: device, channel: 2) }

  it "collects enabled commands from the instance's latest result" do
    binding
    Trace.create!(logic_instance: instance)

    command = described_class.new.enabled_commands_by_device_id.fetch(device.id).sole

    expect(command).to have_attributes(output_binding: binding, channel: 2, desired_output: true)
  end

  it "requires both the instance and binding gates" do
    binding
    Trace.create!(logic_instance: instance)
    binding.update!(output_enable: false)
    expect(described_class.new.enabled_commands_by_device_id).to be_empty
    binding.update!(output_enable: true)
    instance.update!(output_enable: false)
    expect(described_class.new.enabled_commands_by_device_id).to be_empty
  end

  it "maps booleans to relay operations" do
    driver = WriterFakeDriver.new
    writer = described_class.new
    writer.write(driver, described_class::Command.new(output_binding: binding, device: device, channel: 2, desired_output: true))
    writer.write(driver, described_class::Command.new(output_binding: binding, device: device, channel: 2, desired_output: false))
    expect(driver.writes).to eq([ [ :open, 2 ], [ :close, 2 ] ])
  end
end
