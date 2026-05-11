class OutputBlockApi < RestfulApi
  def by_query(params)
    scope = OutputBlock.all.order(:id)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope = scope.where(device_id: params[:device_id]) if params[:device_id].present?
    scope
  end

  def expound(objects)
    Device.where(id: objects.map(&:device_id).uniq) +
      LogicDiagram.where(id: objects.map(&:logic_diagram_id).uniq)
  end

  def serialize(output)
    latest = output.latest_result
    {
      id: output.id,
      logic_diagram_id: output.logic_diagram_id,
      name: output.name,
      device_id: output.device_id,
      channel: output.channel,
      input_expression: output.input_expression,
      output_enable: output.output_enable,
      latest_value: latest&.fetch("value", nil),
      latest_state: latest&.fetch("state", nil),
      desired_output: output.desired_output,
      effective_output: output.effective_output,
      write_pending: output.write_pending?,
      created_at: output.created_at.iso8601,
      updated_at: output.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_obj, _params) = true
  def can_destroy(_obj) = true

  def create_params(params)
    params.require(:output_block).permit(
      :logic_diagram_id,
      :name,
      :device_id,
      :channel,
      :input_expression,
      :output_enable
    )
  end

  def invalidates(_object)
    { OutputBlock => :queries, LogicDiagram => :records }
  end
end
