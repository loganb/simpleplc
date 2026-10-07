class LogicOutputBindingApi < RestfulApi
  def by_query(params)
    scope = LogicOutputBinding.all.order(:id)
    scope = scope.where(logic_instance_id: params[:logic_instance_id]) if params[:logic_instance_id].present?
    scope = scope.where(device_id: params[:device_id]) if params[:device_id].present?
    scope
  end

  def expound(objects)
    LogicInstance.where(id: objects.map(&:logic_instance_id).uniq) +
      LogicOutput.where(id: objects.map(&:logic_output_id).uniq) +
      Device.where(id: objects.map(&:device_id).uniq)
  end

  def serialize(binding)
    latest = binding.latest_result
    {
      id: binding.id,
      logic_instance_id: binding.logic_instance_id,
      logic_output_id: binding.logic_output_id,
      target_kind: binding.target_kind,
      device_id: binding.device_id,
      channel: binding.channel,
      output_enable: binding.output_enable,
      latest_value: latest&.fetch("value", nil),
      latest_state: latest&.fetch("state", nil),
      desired_output: binding.desired_output,
      effective_output: binding.effective_output,
      write_pending: binding.write_pending?,
      created_at: binding.created_at.iso8601,
      updated_at: binding.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:logic_output_binding).permit(
      :logic_instance_id, :logic_output_id, :target_kind,
      :device_id, :channel, :output_enable
    )
  end

  def invalidates(_object)
    { LogicOutputBinding => :queries, LogicInstance => :records }
  end
end
