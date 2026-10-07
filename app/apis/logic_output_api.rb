class LogicOutputApi < RestfulApi
  def by_query(params)
    scope = LogicOutput.all.order(:id)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope
  end

  def expound(objects)
    LogicDiagram.where(id: objects.map(&:logic_diagram_id).uniq)
  end

  def serialize(output)
    {
      id: output.id,
      logic_diagram_id: output.logic_diagram_id,
      name: output.name,
      value_type: output.value_type,
      units: output.units,
      input_expression: output.input_expression,
      created_at: output.created_at.iso8601,
      updated_at: output.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:logic_output).permit(
      :logic_diagram_id, :name, :value_type, :units, :input_expression
    )
  end

  def invalidates(_object)
    { LogicOutput => :queries, LogicDiagram => :records, LogicOutputBinding => :queries }
  end
end
