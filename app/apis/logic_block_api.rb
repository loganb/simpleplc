class LogicBlockApi < RestfulApi
  TYPES_BY_BLOCK_TYPE = {
    "hysteresis" => "HysteresisLogicBlock",
    "latch" => "LatchLogicBlock",
    "timer_counter" => "TimerCounterLogicBlock",
    "expression" => "ExpressionLogicBlock"
  }.freeze
  BLOCK_TYPES_BY_TYPE = TYPES_BY_BLOCK_TYPE.invert.freeze

  def by_query(params)
    scope = LogicBlock.all.order(:stratum, :id)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope
  end

  def expound(objects)
    LogicDiagram.where(id: objects.map(&:logic_diagram_id).uniq)
  end

  def serialize(block)
    {
      id:                block.id,
      logic_diagram_id:  block.logic_diagram_id,
      name:              block.name,
      type:              block.type,
      block_type:        block_type_for(block),
      stratum:           block.stratum,
      input_expressions: block.input_expressions,
      config:            block.config,
      notes:             block.notes,
      created_at:        block.created_at.iso8601,
      updated_at:        block.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_obj, _params) = true
  def can_destroy(_obj) = true

  def new(params)
    attrs = params.to_h
    block_type = attrs.delete("block_type")
    raise ActionController::BadRequest, "block_type is required" if block_type.blank?
    class_for_block_type(block_type).new(attrs)
  end

  def create(params)
    new(params).tap(&:save!)
  end

  def update(object, params)
    attrs = params.to_h
    block_type = attrs.delete("block_type")
    object = object.becomes!(class_for_block_type(block_type)) if block_type.present? && block_type != block_type_for(object)
    object.update!(attrs)
  end

  def create_params(params)
    params.require(:logic_block).permit(
      :logic_diagram_id,
      :name,
      :block_type,
      :stratum,
      :notes,
      input_expressions: {},
      config: {}
    )
  end

  def invalidates(_object)
    { LogicBlock => :queries, LogicDiagram => :records }
  end

  private

  def class_for_block_type(block_type)
    TYPES_BY_BLOCK_TYPE.fetch(block_type.to_s).constantize
  rescue KeyError
    raise ActionController::BadRequest, "unknown block_type #{block_type.inspect}"
  end

  def block_type_for(block)
    BLOCK_TYPES_BY_TYPE.fetch(block.type)
  end

end
