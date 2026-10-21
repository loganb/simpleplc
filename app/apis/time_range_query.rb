# Query params for history listings: optional since (inclusive) / until
# (exclusive) ISO 8601 times, and a clamped limit.
module TimeRangeQuery
  private

  def within_time_range(scope, column, params)
    since = parse_time(params, :since)
    before = parse_time(params, :until)
    scope = scope.where(column => since..) if since
    scope = scope.where(column => ...before) if before
    scope
  end

  def limit_param(params, default:, max:)
    params.fetch(:limit, default).to_i.clamp(1, max)
  end

  def parse_time(params, key)
    return nil if params[key].blank?

    Time.zone.iso8601(params[key].to_s)
  rescue ArgumentError
    raise RestfulApiController::UnprocessableEntityError, "#{key} must be an ISO 8601 time"
  end
end
