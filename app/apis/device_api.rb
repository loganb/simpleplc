class DeviceApi < RestfulApi
  def by_query(params)
    scope = Device.all.order(:modbus_address)
    scope = scope.where(host_interface_id: params[:host_interface_id]) if params[:host_interface_id].present?
    scope
  end

  def serialize(device)
    {
      id:               device.id,
      name:             device.name,
      modbus_address:   device.modbus_address,
      driver:           device.driver,
      host_interface_id: device.host_interface_id,
      last_polled_at:   device.last_polled_at&.iso8601,
      current_state:    device.current_state
    }
  end
end
