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
      measurements: Measurement.where(device_id: ids).map { |m| m.slice(:id, :name, :device_id, :logic_diagram_id) },
      output_blocks: OutputBlock.where(device_id: ids).map { |o| o.slice(:id, :name, :device_id, :logic_diagram_id, :channel, :output_enable) } }
  end

  def self.deletable!(ids)
    data = impact(ids)
    if data[:measurements].any? || data[:output_blocks].any?
      raise HardwareError.new("Reassign or remove dependent measurements and outputs before deleting", code: "dependencies", details: data)
    end
  end

  def self.compatible!(device)
    bad_outputs = OutputBlock.where(device_id: device.id).any? { |o| !device.supports_binary_output?(o.channel) }
    bad_inputs = Measurement.where(device_id: device.id, mode: "acquisition").where.not(source_path: [ nil, "" ]).any? do |m|
      !device.supports_input?(m.source_path)
    end
    raise HardwareError, "Selected driver is incompatible with existing measurements or outputs" if bad_outputs || bad_inputs
  end
end
