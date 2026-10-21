# Starting a scan is a create; cancelling is a patch of `state` to "cancelled".
# Progress and results belong to the executor (HardwareScan) and are never
# client-writable.
class DeviceScanApi < RestfulApi
  def by_query(params)
    scope = DeviceScan.all.order(:id)
    scope = scope.where(host_interface_id: params[:host_interface_id]) if params[:host_interface_id].present?
    scope
  end

  def can_create(params) = true
  def can_update(scan, params) = true

  def create_params(params)
    params.require(:device_scan).permit(:host_interface_id, :first_address, :last_address)
  end

  def create(params)
    # Serialized per bus so two requests can't both pass the one-active-scan check.
    bus = HostInterface.find(params[:host_interface_id])
    bus.with_lock { super(params) }
  end

  def update_params(params)
    params.require(:device_scan).permit(:state)
  end

  def update(scan, params)
    unless params[:state] == "cancelled"
      raise HardwareError.new("A scan can only be cancelled", status: :unprocessable_entity)
    end
    # Cancelling a finished scan is a no-op; the executor owns every other transition.
    scan.with_lock do
      scan.update!(state: "cancelled", finished_at: Time.current) if scan.active?
    end
  end

  def invalidates(scan)
    { DeviceScan => :queries }
  end

  def serialize(scan)
    {
      id: scan.id,
      host_interface_id: scan.host_interface_id,
      first_address: scan.first_address,
      last_address: scan.last_address,
      state: scan.state,
      completed: scan.completed,
      total: scan.total,
      results: scan.results,
      error: scan.error,
      started_at: scan.started_at&.iso8601,
      finished_at: scan.finished_at&.iso8601
    }
  end
end
