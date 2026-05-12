class HostInterfaceApi < RestfulApi
  def by_query(params)
    HostInterface.all.order(:id)
  end

  def can_create(params) = true
  def can_update(host_interface, params) = true
  def can_destroy(host_interface) = true

  def create_params(params)
    params.require(:host_interface).permit(:port, :baud_rate, :data_bits, :stop_bits, :parity)
  end

  def invalidates(host_interface)
    {
      HostInterface => :queries,
      Device => :queries
    }
  end

  def serialize(hi)
    {
      id:        hi.id,
      port:      hi.port,
      baud_rate: hi.baud_rate,
      data_bits: hi.data_bits,
      stop_bits: hi.stop_bits,
      parity:    hi.parity
    }
  end
end
