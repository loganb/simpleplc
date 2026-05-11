class TraceApi < RestfulApi
  def by_query(params)
    scope = Trace.all.order(recorded_at: :desc, id: :desc)
    scope = scope.where(logic_diagram_id: params[:logic_diagram_id]) if params[:logic_diagram_id].present?
    scope.limit(params.fetch(:limit, 100).to_i.clamp(1, 1000))
  end

  def serialize(trace)
    {
      id: trace.id,
      logic_diagram_id: trace.logic_diagram_id,
      results: trace.results,
      recorded_at: trace.recorded_at.iso8601,
      created_at: trace.created_at.iso8601,
      updated_at: trace.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:trace).permit(:logic_diagram_id, :recorded_at)
  end

  def invalidates(_object)
    { Trace => :queries, LogicBlock => :records, Measurement => :records, OutputBlock => :records }
  end
end
