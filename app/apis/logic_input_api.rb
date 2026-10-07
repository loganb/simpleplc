class LogicInputApi < RestfulApi
  def by_query(params)
    scope = LogicInput.all.order(:name)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope
  end

  def expound(objects)
    LogicDiagram.where(id: objects.map(&:logic_diagram_id).uniq)
  end

  def serialize(input)
    {
      id: input.id,
      logic_diagram_id: input.logic_diagram_id,
      name: input.name,
      value_type: input.value_type,
      units: input.units,
      created_at: input.created_at.iso8601,
      updated_at: input.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:logic_input).permit(:logic_diagram_id, :name, :value_type, :units)
  end

  def invalidates(_object)
    { LogicInput => :queries, LogicDiagram => :records, LogicInputBinding => :queries }
  end
end
