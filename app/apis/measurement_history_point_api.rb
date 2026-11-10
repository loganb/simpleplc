class MeasurementHistoryPointApi < RestfulApi
  def canonicalize_ids(ids) = ids

  def by_query(params)
    ids = params[:measurement_ids]
    target = params[:target_points]
    valid_integer = ->(v) { v.is_a?(Integer) && v.positive? }
    raise RestfulApiController::UnprocessableEntityError, "measurement_ids must be an array of positive integers" unless ids.is_a?(Array) && ids.all? { |id| valid_integer.call(id) }
    raise RestfulApiController::UnprocessableEntityError, "target_points must be a positive integer" unless valid_integer.call(target)
    begin
      since = Time.iso8601(params[:since].to_s)
      ending = Time.iso8601(params[:until].to_s)
    rescue ArgumentError
      raise RestfulApiController::UnprocessableEntityError, "since and until must be ISO 8601 times"
    end
    from, to = [ since, ending ].map { |time| MeasurementHistory::Query.us(time) }
    unless from < to && [ from, to ].all? { |v| v.abs <= MeasurementHistoryPointId::MAX_SAFE }
      raise RestfulApiController::UnprocessableEntityError, "invalid time range"
    end
    ids = ids.uniq.sort
    snapshot do
      authorize_measurements(ids)
      query = MeasurementHistory::Query.new(ids: ids, since_us: from, until_us: to, target: target)
      points = query.call
      @metadata = query.metadata
      points
    end
  end

  def query_metadata(_objects) = @metadata

  def by_ids(ids)
    decoded = ids.map { |id| MeasurementHistoryPointId.decode(id) }
    snapshot do
      valid = decoded.compact
      measurements = Measurement.where(id: valid.map { |d| d[1] }.uniq).index_by(&:id)
      accessible = MeasurementApi.new(controller).can_access(measurements.values)
      permitted = measurements.values.zip(accessible).select(&:last).map { |m, _| m.id }
      samples = MeasurementSample.where(id: valid.select { |d| d[0] == "s" }.map(&:last), measurement_id: permitted).index_by(&:id)
      decoded.map do |entry|
        next unless entry && permitted.include?(entry[1])
        if entry[0] == "s"
          sample = samples[entry[2]]
          MeasurementHistory::Query.sample(sample) if sample && sample.measurement_id == entry[1]
        else
          _, id, from, to, digest = entry
          query = MeasurementHistory::Query.new(ids: [ id ], since_us: from, until_us: to, target: 1)
          query.interval_points.find { |point| MeasurementHistoryPointId.digest(point.attributes[:source]) == digest && point.id == MeasurementHistoryPointId.encode(entry) }
        end
      end
    end
  end

  def serialize(point) = point.attributes

  private

  def authorize_measurements(ids)
    records = Measurement.where(id: ids).to_a
    raise ActiveRecord::RecordNotFound unless records.size == ids.size
    raise RestfulApiController::ForbiddenError unless MeasurementApi.new(controller).can_access(records).all?
  end

  def snapshot(&block)
    connection = ActiveRecord::Base.connection
    if connection.transaction_open?
      yield
    else
      ActiveRecord::Base.transaction(isolation: :repeatable_read) do
        connection.execute("SET TRANSACTION READ ONLY")
        yield
      end
    end
  end
end
