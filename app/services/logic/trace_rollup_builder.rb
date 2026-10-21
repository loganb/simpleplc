module Logic
  # Summarizes the traces of one minute into a rollup's results: per source
  # id, the value statistics. Values only; block state is not rolled up.
  #
  #   number:  min, max, mean, last, count
  #   boolean: true_fraction, transitions, last, count
  #   both:    null_count
  #
  # count covers non-null samples, so a source that was null all minute has only
  # null_count. A source whose type changed mid-minute (diagram edit) is
  # summarized by its latest type; samples of the other type are dropped.
  module TraceRollupBuilder
    module_function

    SCHEMA_VERSION = 1
    BUCKETS = %w[logic_inputs logic_blocks logic_outputs].freeze

    # results_list: Trace#results of one minute, in recorded_at order.
    def build(results_list)
      rollup = { "schema_version" => SCHEMA_VERSION }
      BUCKETS.each do |bucket|
        series = Hash.new { |hash, id| hash[id] = [] }
        results_list.each do |results|
          results.to_h.fetch(bucket, {}).each { |id, result| series[id] << result.to_h["value"] }
        end
        rollup[bucket] = series.transform_values { |values| summarize(values) }
      end
      rollup
    end

    def summarize(values)
      stats = { "null_count" => values.count(&:nil?) }
      present = values.compact
      return stats if present.empty?

      if present.last in true | false
        booleans = present.select { |value| value in true | false }
        stats.merge(
          "true_fraction" => booleans.count(true).fdiv(booleans.size),
          "transitions" => booleans.each_cons(2).count { |a, b| a != b },
          "last" => booleans.last,
          "count" => booleans.size
        )
      else
        numbers = present.select { |value| value.is_a?(Numeric) }
        stats.merge(
          "min" => numbers.min,
          "max" => numbers.max,
          "mean" => numbers.sum.fdiv(numbers.size),
          "last" => numbers.last,
          "count" => numbers.size
        )
      end
    end
  end
end
