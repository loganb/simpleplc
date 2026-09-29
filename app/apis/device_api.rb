class DeviceApi < RestfulApi
  def by_query(params)
    scope = Device.all.order(:modbus_address)
    scope = scope.where(host_interface_id: params[:host_interface_id]) if params[:host_interface_id].present?
    scope
  end

  def can_create(params) = true
  def can_update(device, params) = true
  def can_destroy(device) = true

  def create_params(params)
    params.require(:device).permit(:name, :host_interface_id, :modbus_address, :driver, io_labels: {})
  end

  def create(params)
    bus = HostInterface.find(params[:host_interface_id])
    bus.with_lock { HardwareConfiguration.quiet!(bus) { super(params) } }
  end

  def update_params(params)
    create_params(params).tap { |p| p[:configuration_revision] = params.require(:device)[:configuration_revision] }
  end

  def update(device, params)
    fields = params.to_h
    expected = fields.delete("configuration_revision")
    ids = [ device.host_interface_id, fields.fetch("host_interface_id", device.host_interface_id).to_i ].uniq.sort
    Device.transaction do
      buses = HostInterface.where(id: ids).order(:id).lock.to_a
      raise ActiveRecord::RecordNotFound unless buses.size == ids.size
      device.lock!
      HardwareConfiguration.check_revision!(device, expected)
      structural = (fields.keys & %w[host_interface_id driver modbus_address]).any? { |key| fields[key].to_s != device.public_send(key).to_s }
      raise HardwareError, "Cancel the scan before editing devices" if buses.any?(&:scan_active?)
      action = -> { device.assign_attributes(fields); HardwareConfiguration.compatible!(device); device.save! }
      if structural
        with_quiet_buses(buses, &action)
      else
        action.call
      end
    end
  end

  def destroy(device)
    bus = device.host_interface
    bus.with_lock do
      device.lock!
      HardwareConfiguration.quiet!(bus) do
        HardwareConfiguration.deletable!([ device.id ])
        device.destroy!
      end
    end
  end

  def with_quiet_buses(buses, &block)
    return block.call if buses.empty?
    HardwareConfiguration.quiet!(buses.first) { with_quiet_buses(buses.drop(1), &block) }
  end

  def expound(objects)
    HostInterface.where(id: objects.map(&:host_interface_id).uniq)
  end

  def invalidates(device)
    {
      Device => :queries,
      HostInterface => :queries
    }
  end

  def serialize(device)
    {
      configuration_revision: device.configuration_revision,
      id:               device.id,
      name:             device.name,
      modbus_address:   device.modbus_address,
      driver:           device.driver,
      host_interface_id: device.host_interface_id,
      last_polled_at:   device.last_polled_at&.iso8601,
      current_state:    device.current_state,
      io_labels:        device.io_labels,
      inputs:           device.inputs,
      outputs:          device.outputs
    }
  end
end
