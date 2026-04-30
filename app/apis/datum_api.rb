class DatumApi < RestfulApi
  def by_query(params)
    scope = Datum.all
    scope = scope.where(trace_id: params[:trace_id]) if params[:trace_id].present?
    scope = scope.where(source_type: params[:source_type]) if params[:source_type].present?
    scope = scope.where(source_id: params[:source_id]) if params[:source_id].present?
    scope = scope.where("recorded_at >= ?", Time.iso8601(params[:since])) if params[:since].present?
    scope = scope.where("recorded_at <= ?", Time.iso8601(params[:until])) if params[:until].present?
    scope.order(recorded_at: :desc).limit(params.fetch(:limit, 100).to_i.clamp(1, 1000))
  end

  def serialize(datum)
    {
      id:           datum.id,
      trace_id:     datum.trace_id,
      source_type:  datum.source_type,
      source_id:    datum.source_id,
      value:        datum.value,
      state:        datum.state,
      input_values: datum.input_values,
      recorded_at:  datum.recorded_at.iso8601
    }
  end
end
