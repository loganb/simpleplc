class MeasurementApi < RestfulApi
  def by_query(params)
    scope = Measurement.all.order(:name)
    scope = scope.where(device_id: params[:device_id]) if params[:device_id].present?
    scope
  end

  def expound(objects)
    Device.where(id: objects.filter_map(&:device_id).uniq)
  end

  def serialize(m)
    {
      id:            m.id,
      name:          m.name,
      source_type:   m.source_type,
      device_id:     m.device_id,
      source_path:   m.source_path,
      update_period: m.update_period,
      units:         m.units,
      created_at:    m.created_at.iso8601,
      updated_at:    m.updated_at.iso8601
    }
  end

  def can_create(_params)  = true
  def can_update(_obj, _p) = true
  def can_destroy(_obj)    = true

  def create_params(params)
    params.require(:measurement).permit(:name, :source_type, :device_id, :source_path, :update_period, :units)
  end
end
