module Logic
  class OutputWriter
    Command = Struct.new(:output_block, :device, :channel, :desired_output, keyword_init: true)

    def enabled_commands_by_device_id
      commands = OutputBlock.includes(:device, :logic_diagram).filter_map do |output_block|
        next unless output_block.logic_diagram.output_enable? && output_block.output_enable?
        next if output_block.latest_datum.nil?

        Command.new(
          output_block: output_block,
          device: output_block.device,
          channel: output_block.channel,
          desired_output: output_block.desired_output
        )
      end

      commands.group_by { |command| command.device.id }
    end

    def write(driver, command)
      command.desired_output ? driver.open(command.channel) : driver.close(command.channel)
    end
  end
end
