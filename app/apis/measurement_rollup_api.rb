class MeasurementRollupApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    scope = MeasurementRollup.where(measurement_id: params.require(:measurement_id))
    scope = within_time_range(scope, :bucket_start, params).order(bucket_start: :desc, id: :desc)
    return scope if params[:limit].blank?
    limit = params[:limit]
    unless (limit.is_a?(Integer) && limit.positive?) || (limit.is_a?(String) && limit.match?(/\A[1-9]\d*\z/))
      raise RestfulApiController::UnprocessableEntityError, "limit must be a positive integer"
    end
    scope.limit(limit.to_i)
  end

  def serialize(rollup)
    { id: rollup.id, measurement_id: rollup.measurement_id, bucket_start: rollup.bucket_start.iso8601, sample_count: rollup.sample_count, summaries: rollup.summaries }
  end
end
