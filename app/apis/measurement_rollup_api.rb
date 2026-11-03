class MeasurementRollupApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    scope = MeasurementRollup.where(measurement_id: params.require(:measurement_id))
    within_time_range(scope, :bucket_start, params).order(bucket_start: :desc, id: :desc).limit(limit_param(params, default: 100, max: 1000))
  end

  def serialize(rollup)
    { id: rollup.id, measurement_id: rollup.measurement_id, bucket_start: rollup.bucket_start.iso8601, sample_count: rollup.sample_count, summaries: rollup.summaries }
  end
end
