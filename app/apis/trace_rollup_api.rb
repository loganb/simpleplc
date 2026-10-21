# Read-only one-minute history; see Logic::TraceRollupBuilder.
class TraceRollupApi < RestfulApi
  include TimeRangeQuery

  def by_query(params)
    scope = TraceRollup.where(logic_instance_id: params.require(:logic_instance_id))
    scope = within_time_range(scope, :bucket_start, params)
    # Newest first, so a range wider than the limit returns its most recent end.
    scope.order(bucket_start: :desc).limit(limit_param(params, default: 1440, max: 5000))
  end

  def serialize(rollup)
    {
      id: rollup.id,
      logic_instance_id: rollup.logic_instance_id,
      bucket_start: rollup.bucket_start.iso8601,
      sample_count: rollup.sample_count,
      results: rollup.results
    }
  end
end
