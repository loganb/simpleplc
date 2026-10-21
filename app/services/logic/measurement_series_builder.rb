module Logic
  class MeasurementSeriesBuilder
    def initialize(measurement:, since:, until_time:, max_points:)
      @measurement = measurement
      @since = since
      @until_time = until_time
      @max_points = max_points
    end

    def build
      points = if exact_window?
        exact_points
      else
        tail = recent_tail(limit: [ max_points / 10, 120 ].min)
        aggregate_points(max_points - tail.length) + tail
      end
      MeasurementSeries.new(
        id: "#{measurement.id}:#{since.to_i}:#{until_time.to_i}:#{max_points}",
        measurement_id: measurement.id,
        since: since.iso8601,
        until_time: until_time.iso8601,
        points: points.sort_by { |point| point[:recorded_at] }
      )
    end

    private

    attr_reader :measurement, :since, :until_time, :max_points

    def exact_window?
      return false unless since >= Time.current - 48.hours && (until_time - since) <= max_points.seconds

      measurement.measurement_samples.where(recorded_at: since...until_time)
        .limit(max_points + 1).pluck(:id).length <= max_points
    end

    def exact_points
      measurement.measurement_samples.where(recorded_at: since...until_time)
        .order(:recorded_at, :id).limit(max_points).map do |sample|
          { recorded_at: sample.recorded_at.iso8601(6), precision: "exact", value: sample.value }
        end
    end

    def aggregate_points(budget)
      return [] if budget.zero?

      # Allow for both partially covered end buckets when aligning to epoch.
      interval = [ ((until_time - since) / [ budget - 1, 1 ].max / 60).ceil * 60, 60 ].max
      if interval == 60
        measurement.measurement_rollups.where(bucket_start: since...until_time)
          .order(:bucket_start).limit(budget).map do |rollup|
            rollup_point(rollup.bucket_start, 60, rollup.sample_count, rollup.stats)
          end
      else
        grouped_rollups(interval)
      end
    end

    def grouped_rollups(interval)
      conn = ActiveRecord::Base.connection
      table = conn.quote_table_name("measurement_rollups")
      id = conn.quote(measurement.id)
      start_time = conn.quote(since)
      end_time = conn.quote(until_time)
      rows = conn.select_all(<<~SQL)
        SELECT floor(extract(epoch FROM bucket_start) / #{interval})::bigint AS bucket_number,
          sum(sample_count)::bigint AS sample_count,
          sum(coalesce((stats->>'null_count')::integer, 0))::bigint AS null_count,
          sum(coalesce((stats->'number'->>'count')::integer, 0))::bigint AS number_count,
          min((stats->'number'->>'min')::double precision) AS number_min,
          max((stats->'number'->>'max')::double precision) AS number_max,
          sum((stats->'number'->>'mean')::double precision * (stats->'number'->>'count')::integer) AS number_sum,
          sum(coalesce((stats->'boolean'->>'count')::integer, 0))::bigint AS boolean_count,
          sum(coalesce((stats->'boolean'->>'true_count')::integer, 0))::bigint AS true_count
        FROM #{table}
        WHERE measurement_id = #{id} AND bucket_start >= #{start_time} AND bucket_start < #{end_time}
        GROUP BY bucket_number ORDER BY bucket_number
      SQL
      rows.map do |row|
        stats = { "null_count" => row.fetch("null_count").to_i }
        number_count = row.fetch("number_count").to_i
        boolean_count = row.fetch("boolean_count").to_i
        if number_count.positive?
          stats["number"] = {
            "min" => row.fetch("number_min").to_f,
            "max" => row.fetch("number_max").to_f,
            "mean" => row.fetch("number_sum").to_f / number_count,
            "count" => number_count
          }
        end
        if boolean_count.positive?
          stats["boolean"] = {
            "true_fraction" => row.fetch("true_count").to_f / boolean_count,
            "count" => boolean_count
          }
        end
        rollup_point(Time.at(row.fetch("bucket_number").to_i * interval).utc,
          interval, row.fetch("sample_count").to_i, stats)
      end
    end

    def recent_tail(limit:)
      start_time = [ since, (Time.current - 1.minute).beginning_of_minute ].max
      return [] if until_time <= start_time

      measurement.measurement_samples.where(recorded_at: start_time...until_time)
        .order(recorded_at: :desc, id: :desc).limit(limit).to_a.reverse.map do |sample|
          { recorded_at: sample.recorded_at.iso8601(6), precision: "exact", value: sample.value }
        end
    end

    def rollup_point(at, seconds, sample_count, stats)
      { recorded_at: at.iso8601, precision: "rollup", interval_seconds: seconds,
        sample_count: sample_count, stats: stats }
    end
  end
end
