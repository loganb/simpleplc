class LogicDiagramApi < RestfulApi
  def by_query(_params)
    LogicDiagram.all.order(:name)
  end

  def expound(objects)
    LogicBlock.where(logic_diagram_id: objects.map(&:id))
  end

  def serialize(diagram)
    {
      id:         diagram.id,
      name:       diagram.name,
      created_at: diagram.created_at.iso8601,
      updated_at: diagram.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_obj, _params) = true
  def can_destroy(_obj) = true

  def create_params(params)
    params.require(:logic_diagram).permit(:name)
  end

  def invalidates(_object)
    { LogicDiagram => :queries }
  end
end
