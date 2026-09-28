require "digest"

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

  def initialize(bus, parameters)
    @bus = bus
    @params = parameters.deep_stringify_keys
  end

  # Preview validates the same final set as apply, without saving any records.
  def execute(apply: false)
    @bus.with_lock do
      token = @params["request_id"]
      digest = Digest::SHA256.hexdigest(JSON.generate(@params.except("request_id")))
      if apply && token.present? && @bus.last_apply["request_id"] == token
        raise HardwareError, "Request ID was reused for different changes" unless @bus.last_apply["digest"] == digest
        return @bus.last_apply["result"]
      end
      self.class.check_revision!(@bus, @params["configuration_revision"])
      self.class.quiet!(@bus) do
        rows = @params["devices"]
        raise HardwareError.new("Supply the complete device list", status: :unprocessable_entity) unless rows.is_a?(Array) && rows.size <= 247 && rows.all? { |row| row.is_a?(Hash) }
        existing = @bus.devices.lock.order(:id).index_by(&:id)
        seen_ids = []
        devices = rows.map do |row|
          id = row["id"]&.to_i
          raise HardwareError, "Duplicate or foreign device ID" if id && (seen_ids.include?(id) || !existing.key?(id))
          seen_ids << id if id
          device = id ? existing.fetch(id) : @bus.devices.build
          device.assign_attributes(row.slice("name", "driver", "modbus_address"))
          device.reconciling = true
          raise ActiveRecord::RecordInvalid, device unless device.valid?
          self.class.compatible!(device) if device.persisted?
          validate_scan_choice!(row, device) if row["scan_request_id"].present?
          device
        end
        addresses = devices.map(&:modbus_address)
        raise HardwareError.new("Each device must have a different address", status: :unprocessable_entity) unless addresses.uniq == addresses
        deleted = existing.keys - seen_ids
        self.class.deletable!(deleted)
        result = { "devices" => devices.map { |d| d.attributes.slice("id", "name", "driver", "modbus_address") },
          "deleted_ids" => deleted, "impact" => self.class.impact(existing.keys), "configuration_revision" => @bus.configuration_revision }
        if apply
          raise HardwareError.new("An apply request ID is required", status: :unprocessable_entity) unless token.is_a?(String) && token.size.between?(1, 100)
          Device.connection.execute("SET CONSTRAINTS devices_bus_address DEFERRED")
          deleted.each { |id| existing.fetch(id).destroy! }
          devices.each(&:save!)
          Device.connection.execute("SET CONSTRAINTS devices_bus_address IMMEDIATE")
          @bus.reload
          result["devices"] = devices.map { |d| d.attributes.slice("id", "name", "driver", "modbus_address") }
          result["configuration_revision"] = @bus.configuration_revision
          @bus.update!(last_apply: { request_id: token, digest: digest, result: result })
        end
        result
      end
    end
  end

  private

  def validate_scan_choice!(row, device)
    raise HardwareError, "Scan results changed; review the latest results" unless row["scan_request_id"] == @bus.scan_request_id
    raise HardwareError, "Adapter changed since this scan" unless @bus.scan_options["port"] == @bus.port
    result = @bus.scan_results.fetch("devices", []).find { |d| d["address"] == device.modbus_address && d["profile_index"] == row["profile_index"].to_i }
    raise HardwareError, "Address was not found in this scan" unless result
    raise HardwareError, "Select the serial settings used by this result before applying" unless result["profile"] == @bus.attributes.slice(*HardwareScan::PROFILE_KEYS)
    verdict = result.fetch("driver_support").find { |d| d["driver"] == device.driver }
    raise HardwareError, "This driver is incompatible with the scan result" unless verdict && %w[yes maybe].include?(verdict["support"])
  end
end
