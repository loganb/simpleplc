module MeasurementHistory
  class Reducer
    def initialize
      @groups = {}
    end

    def add(measurement_id, start_us, end_us, source, statistics, tier:, last: nil, last_known: false, order: nil)
      source = MeasurementHistoryPointId::FIELDS.to_h { |key| [ key, source[key] ] }
      key = [ measurement_id, start_us, end_us, MeasurementHistoryPointId.digest(source) ]
      group = (@groups[key] ||= { source: source, count: 0, null_count: 0, sum: 0.0, min: nil, max: nil, tiers: [], last: nil, last_known: true, last_order: nil })
      count = statistics["count"].to_i
      group[:count] += count
      group[:null_count] += statistics["null_count"].to_i
      if count > 0
        mean = source["value_type"] == "boolean" ? statistics["true_fraction"] : statistics["mean"]
        group[:sum] += mean.to_f * count
        min, max = statistics.values_at("min", "max")
        group[:min] = [ group[:min], min ].compact.min
        group[:max] = [ group[:max], max ].compact.max
      end
      group[:tiers] |= [ tier ]
      group[:last_known] &&= last_known
      if last_known && (group[:last_order].nil? || (order <=> group[:last_order]) == 1)
        group[:last], group[:last_order] = last, order
      end
    end

    def points
      @groups.map do |(measurement_id, start_us, end_us, digest), group|
        stats = {}
        if group[:count] > 0
          if group[:source]["value_type"] == "boolean"
            stats[:true_fraction] = group[:sum] / group[:count]
          else
            stats.merge!(min: group[:min], max: group[:max], mean: group[:sum] / group[:count])
          end
        end
        stats[:last] = group[:last_known] ? group[:last] : nil
        coverage = group[:tiers].size == 2 ? "mixed" : group[:tiers].first
        MeasurementHistoryPoint.new(id: MeasurementHistoryPointId.encode([ "b", measurement_id, start_us, end_us, digest ]), measurement_id: measurement_id,
          kind: "bucket", start: self.class.time(start_us), end: self.class.time(end_us), source: group[:source], count: group[:count], null_count: group[:null_count],
          statistics: stats, last_known: group[:last_known], coverage: coverage, gap_detail: coverage == "raw" ? "samples" : "minute")
      end
    end

    def self.time(us) = Time.at(Rational(us, 1_000_000)).utc.iso8601(6)
  end
end
