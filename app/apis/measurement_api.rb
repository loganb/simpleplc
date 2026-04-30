class MeasurementApi < RestfulApi
  def by_query(params)
    scope = Measurement.all.order(:name)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope = scope.where(device_id: params[:device_id]) if params[:device_id].present?
    scope
  end

  def expound(objects)
    Device.where(id: objects.filter_map(&:device_id).uniq) +
      LogicDiagram.where(id: objects.map(&:logic_diagram_id).uniq)
  end

  def serialize(m)
    {
      id:            m.id,
      logic_diagram_id: m.logic_diagram_id,
      name:          m.name,
      mode:          m.mode,
      device_id:     m.device_id,
      source_path:   m.source_path,
      units:         m.units,
      simulation_value: m.simulation_value,
      latest_datum_id: m.latest_trace_datum&.id,
      latest_value:  m.latest_trace_datum&.value,
      created_at:    m.created_at.iso8601,
      updated_at:    m.updated_at.iso8601
    }
  end

  def can_create(_params)  = true
  def can_update(_obj, _p) = true
  def can_destroy(_obj)    = true

  def create_params(params)
    params.require(:measurement).permit(:logic_diagram_id, :name, :mode, :device_id, :source_path, :units, :simulation_value)
  end

  def invalidates(_object)
    { Measurement => :queries, LogicDiagram => :records }
  end
end
