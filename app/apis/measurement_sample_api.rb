class MeasurementSampleApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    scope = MeasurementSample.where(measurement_id: params.require(:measurement_id))
    within_time_range(scope, :recorded_at, params).order(recorded_at: :desc, id: :desc).limit(limit_param(params, default: 100, max: 1000))
  end

  def serialize(sample)
    { id: sample.id, measurement_id: sample.measurement_id, recorded_at: sample.recorded_at.iso8601, snapshot: sample.snapshot }
  end
end
