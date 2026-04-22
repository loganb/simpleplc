class HostInterfaceApi < RestfulApi
  def by_query(params)
    HostInterface.all.order(:id)
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
