class MeasurementSampleApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    scope = MeasurementSample.where(measurement_id: params.require(:measurement_id))
    scope = within_time_range(scope, :recorded_at, params).order(recorded_at: :desc, id: :desc)
    return scope if params[:limit].blank?
    limit = params[:limit]
    unless (limit.is_a?(Integer) && limit.positive?) || (limit.is_a?(String) && limit.match?(/\A[1-9]\d*\z/))
      raise RestfulApiController::UnprocessableEntityError, "limit must be a positive integer"
    end
    scope.limit(limit.to_i)
  end

  def serialize(sample)
    { id: sample.id, measurement_id: sample.measurement_id, recorded_at: sample.recorded_at.iso8601, snapshot: sample.snapshot }
  end
end
