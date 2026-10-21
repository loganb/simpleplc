class TraceApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    scope = Trace.all.order(recorded_at: :desc, id: :desc)
    scope = scope.where(logic_instance_id: params[:logic_instance_id]) if params[:logic_instance_id].present?
    scope = within_time_range(scope, :recorded_at, params)
    # Newest first, so a range wider than the limit returns its most recent end.
    scope.limit(limit_param(params, default: 100, max: 1000))
  end

  def serialize(trace)
    {
      id: trace.id,
      logic_instance_id: trace.logic_instance_id,
      results: trace.results,
      recorded_at: trace.recorded_at.iso8601,
      created_at: trace.created_at.iso8601,
      updated_at: trace.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:trace).permit(:logic_instance_id, :recorded_at)
  end

  def invalidates(_object)
    {
      Trace => :queries,
      LogicInstance => :records,
      LogicInputBinding => :records,
      LogicOutputBinding => :records
    }
  end
end
