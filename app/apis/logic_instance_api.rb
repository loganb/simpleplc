class LogicInstanceApi < RestfulApi
  def by_query(params)
    scope = LogicInstance.all.order(:name)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope
  end

  def expound(objects)
    ids = objects.map(&:id)
    LogicDiagram.where(id: objects.map(&:logic_diagram_id).uniq) +
      LogicInputBinding.where(logic_instance_id: ids) +
      LogicOutputBinding.where(logic_instance_id: ids)
  end

  def serialize(instance)
    {
      id: instance.id,
      logic_diagram_id: instance.logic_diagram_id,
      name: instance.name,
      update_period: instance.update_period,
      output_enable: instance.output_enable,
      created_at: instance.created_at.iso8601,
      updated_at: instance.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:logic_instance).permit(:logic_diagram_id, :name, :update_period, :output_enable)
  end

  def invalidates(_object)
    {
      LogicInstance => :queries,
      LogicDiagram => :records,
      LogicInputBinding => :queries,
      LogicOutputBinding => :queries,
      Trace => :queries
    }
  end
end
