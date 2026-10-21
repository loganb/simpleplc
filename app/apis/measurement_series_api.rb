class MeasurementSeriesApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    measurement = Measurement.find(params.require(:measurement_id))
    now = Time.current
    since = parse_time(params, :since) || now - 1.hour
    until_time = parse_time(params, :until) || now
    raise RestfulApiController::UnprocessableEntityError, "until must be later than since" unless until_time > since

    max_points = params[:max_points].present? ? params[:max_points].to_i.clamp(100, 1200) : 1000
    [ Logic::MeasurementSeriesBuilder.new(measurement: measurement, since: since,
      until_time: until_time, max_points: max_points).build ]
  end

  def serialize(series)
    {
      id: series.id,
      measurement_id: series.measurement_id,
      since: series.since,
      until: series.until_time,
      points: series.points
    }
  end
end
