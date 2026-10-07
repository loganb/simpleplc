class LogicInputBindingApi < RestfulApi
  def by_query(params)
    scope = LogicInputBinding.all.order(:id)
    scope = scope.where(logic_instance_id: params[:logic_instance_id]) if params[:logic_instance_id].present?
    scope = scope.where(device_id: params[:device_id]) if params[:device_id].present?
    scope
  end

  def expound(objects)
    LogicInstance.where(id: objects.map(&:logic_instance_id).uniq) +
      LogicInput.where(id: objects.map(&:logic_input_id).uniq) +
      Device.where(id: objects.filter_map(&:device_id).uniq)
  end

  def serialize(binding)
    {
      id: binding.id,
      logic_instance_id: binding.logic_instance_id,
      logic_input_id: binding.logic_input_id,
      source_kind: binding.source_kind,
      device_id: binding.device_id,
      source_path: binding.source_path,
      fixed_value: binding.fixed_value,
      latest_value: binding.logic_instance.result_for(binding.logic_input)&.fetch("value", nil),
      created_at: binding.created_at.iso8601,
      updated_at: binding.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:logic_input_binding).permit(
      :logic_instance_id, :logic_input_id, :source_kind, :device_id, :source_path, :fixed_value
    )
  end

  def invalidates(_object)
    { LogicInputBinding => :queries, LogicInstance => :records }
  end
end
