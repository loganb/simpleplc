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

  def invalidates(host_interface)
    {
      HostInterface => :queries,
      Device => :queries
    }
  end

  def serialize(hi)
    {
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
