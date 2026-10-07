class HardwareConfiguration
  def self.check_revision!(record, expected)
    raise HardwareError.new("Reload and supply configuration_revision", code: "revision_required", status: :unprocessable_entity) if expected.nil?
    unless expected.to_s == record.configuration_revision.to_s
      raise HardwareError.new("Configuration changed; reload and review your edits", code: "stale_configuration",
        details: { current: record.attributes.slice(*record.class::CONFIGURATION_FIELDS, "configuration_revision") })
    end
  end

  def self.quiet!(bus)
    raise HardwareError, "Disable the interface before changing hardware configuration" if bus.enabled?
    raise HardwareError, "Cancel the scan and wait before changing configuration" if bus.scan_active?
    raise HardwareError, "Waiting for the poller to release this interface" if bus.online?
    # Probe the cooperative lock without opening the serial device. The bus row
    # remains locked during the caller's mutation, excluding new scan requests.
    lock = SerialBusLock.acquire(bus.port) if bus.port_present?
    yield
  ensure
    lock&.close
  end

  # The dependencies that block deleting these devices, returned as error details.
  def self.impact(ids)
    { devices: Device.where(id: ids).map { |d| { id: d.id, name: d.name } },
      logic_input_bindings: LogicInputBinding.includes(:logic_input).where(device_id: ids).map do |binding|
        binding.slice(:id, :device_id, :logic_instance_id).merge(name: binding.logic_input.name)
      end,
      logic_output_bindings: LogicOutputBinding.includes(:logic_output).where(device_id: ids).map do |binding|
        binding.slice(:id, :device_id, :logic_instance_id, :channel, :output_enable).merge(name: binding.logic_output.name)
      end }
  end

  def self.deletable!(ids)
    data = impact(ids)
    if data[:logic_input_bindings].any? || data[:logic_output_bindings].any?
      raise HardwareError.new("Reassign or remove dependent instance connections before deleting", code: "dependencies", details: data)
    end
  end

  def self.compatible!(device)
    bad_outputs = LogicOutputBinding.includes(:logic_output).where(device_id: device.id).any? do |binding|
      output = device.outputs.find { |candidate| candidate[:channel] == binding.channel }
      output.nil? || output[:value_type] != binding.logic_output.value_type
    end
    bad_inputs = LogicInputBinding.includes(:logic_input).where(device_id: device.id, source_kind: "device_input").any? do |binding|
      input = device.inputs.find { |candidate| candidate[:path] == binding.source_path }
      input.nil? || (input[:value_type] != binding.logic_input.value_type &&
        !(binding.logic_input.value_type == "number" && input[:value_type] == "boolean"))
    end
    raise HardwareError, "Selected driver is incompatible with existing instance connections" if bad_outputs || bad_inputs
  end
end
