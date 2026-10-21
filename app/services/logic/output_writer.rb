module Logic
  class OutputWriter
    Command = Struct.new(:output_binding, :device, :channel, :desired_output, keyword_init: true)

    def enabled_commands_by_device_id
      commands = LogicOutputBinding.includes(:device, :logic_output, :logic_instance).filter_map do |binding|
        next unless binding.logic_instance.output_enable? && binding.output_enable?
        next if binding.latest_result.nil?
        next if binding.desired_output.nil?

        Command.new(
          output_binding: binding,
          device: binding.device,
          channel: binding.channel,
          desired_output: binding.desired_output
        )
      end

      commands.group_by { |command| command.device.id }
    end

    # False when the device's read-back already shows the desired state, so
    # the poller leaves that relay alone. Unknown read-back counts as pending.
    def pending?(command, data)
      readback = data[:outputs][command.channel - 1] if data.is_a?(Hash) && data[:outputs].is_a?(Array)
      readback.nil? || readback != !!command.desired_output
    end

    def write(driver, command)
      command.desired_output ? driver.open(command.channel) : driver.close(command.channel)
    end
  end
end
