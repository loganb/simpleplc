class HostInterfaceApi < RestfulApi
  def by_query(params)
    HostInterface.all.order(:id)
  end

  def can_create(params) = true
  def can_update(host_interface, params) = true
  def can_destroy(host_interface) = true

  # `enabled` is operator intent and belongs here. `online`, `connection_error`,
  # and `poller_reported_at` are the poller's to write and are deliberately not
  # permitted — a client that could set `online` could fake a bus being held.
  def create_params(params)
    params.require(:host_interface).permit(:name, :enabled, :port, :baud_rate, :data_bits, :stop_bits, :parity)
  end

  def create(params)
    super(params.to_h.merge("enabled" => false))
  end

  def update_params(params)
    create_params(params).tap { |p| p[:configuration_revision] = params.require(:host_interface)[:configuration_revision] }
  end

  def update(bus, params)
    fields = params.to_h
    expected = fields.delete("configuration_revision")
    bus.with_lock do
      HardwareConfiguration.check_revision!(bus, expected)
      raise HardwareError, "Cancel the scan and wait before editing" if bus.scan_active?
      structural = (fields.keys & %w[port baud_rate data_bits stop_bits parity]).any? { |key| fields[key].to_s != bus.public_send(key).to_s }
      if structural
        HardwareConfiguration.quiet!(bus) { bus.update!(fields) }
      else
        bus.update!(fields)
      end
    end
  end

  def destroy(bus)
    bus.with_lock do
      HardwareConfiguration.check_revision!(bus, controller.params[:configuration_revision])
      HardwareConfiguration.quiet!(bus) do
        HardwareConfiguration.deletable!(bus.devices.pluck(:id))
        bus.destroy!
      end
    end
  end

  def invalidates(host_interface)
    {
      HostInterface => :queries,
      Device => :queries
    }
  end

  def serialize(hi)
    {
      configuration_revision: hi.configuration_revision,
      scan_state: hi.scan_state, scan_request_id: hi.scan_request_id,
      scan_options: hi.scan_options, scan_results: hi.scan_results,
      scan_cancel_requested: hi.scan_cancel_requested,
      scan_requested_at: hi.scan_requested_at&.iso8601, scan_started_at: hi.scan_started_at&.iso8601,
      scan_finished_at: hi.scan_finished_at&.iso8601, scan_updated_at: hi.scan_updated_at&.iso8601,
      id:              hi.id,
      name:            hi.name,
      port:            hi.port,
      baud_rate:       hi.baud_rate,
      data_bits:       hi.data_bits,
      stop_bits:       hi.stop_bits,
      parity:          hi.parity,
      enabled:         hi.enabled,
      # Computed, not columns: whether the configured port exists right now, and
      # the poller's report folded together with how recently it arrived.
      port_present:       hi.port_present?,
      resolved_device:    hi.resolved_device,
      connection_state:   hi.connection_state,
      connection_error:   hi.connection_error,
      poller_reported_at: hi.poller_reported_at&.iso8601
    }
  end
end
