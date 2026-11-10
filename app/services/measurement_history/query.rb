module MeasurementHistory
  class Query
    DURATIONS = [ 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800, 1209600, 2592000 ].freeze
    MICRO = 1_000_000
    MINUTE = 60 * MICRO

    attr_reader :metadata

    def initialize(ids:, since_us:, until_us:, target:)
      @ids, @since, @until, @target = ids, since_us, until_us, target
    end

    def call
      return empty if @ids.empty?
      counts = MeasurementSample.where(measurement_id: @ids, recorded_at: time(@since)...time(@until)).group(:measurement_id).count
      candidates = @since >= us(Time.current - 48.hours) ? @ids.select { |id| counts.fetch(id, 0) <= @target } : []
      missing_minutes = summary_only_measurements(@since >= us(Time.current - 48.hours) ? @ids : [])
      raw_ids = candidates - missing_minutes
      bucket_ids = @ids - raw_ids
      min_seconds = (@since < us(Time.current - 48.hours) || (bucket_ids & missing_minutes).any?) ? 60 : 1
      desired = [ Rational(@until - @since, MICRO * @target).ceil, min_seconds ].max
      duration = DURATIONS.find { |d| d >= desired } || ((desired + 2_591_999) / 2_592_000) * 2_592_000
      points = raw_points(raw_ids)
      points.concat(bucket_points(bucket_ids, duration * MICRO)) if bucket_ids.any?
      points.sort_by! { |point| [ point.measurement_id, point.attributes[:start], point.id ] }
      @metadata = { since: Reducer.time(@since), until: Reducer.time(@until), target_points: @target,
        series: @ids.map { |id| { measurement_id: id, kind: raw_ids.include?(id) ? "sample" : "bucket", bucket_seconds: raw_ids.include?(id) ? nil : duration, returned_points: points.count { |p| p.measurement_id == id } } } }
      points
    end

    def self.sample(sample)
      value = sample.snapshot["value"]
      at = Reducer.time(us(sample.recorded_at))
      MeasurementHistoryPoint.new(id: MeasurementHistoryPointId.encode([ "s", sample.measurement_id, sample.id ]), measurement_id: sample.measurement_id,
        kind: "sample", start: at, end: at, recorded_at: at, source: MeasurementHistoryPointId::FIELDS.to_h { |k| [ k, sample.snapshot[k] ] },
        count: value.nil? ? 0 : 1, null_count: value.nil? ? 1 : 0, value: value)
    end

    def self.us(time) = (time.to_r * MICRO).to_i
    def us(time) = self.class.us(time)
    def time(us) = Time.at(Rational(us, MICRO)).utc

    # For show, the encoded interval is itself the bucket, including clipped edges.
    def interval_points
      bucket_points(@ids, @until - @since, fixed: true)
    end

    private

    def empty
      @metadata = { since: Reducer.time(@since), until: Reducer.time(@until), target_points: @target, series: [] }
      []
    end

    def summary_only_measurements(ids)
      return [] if ids.empty?
      counts = represented_counts(ids, (@since / MINUTE) * MINUTE, ((@until + MINUTE - 1) / MINUTE) * MINUTE)
      missing = []
      MeasurementRollup.where(measurement_id: ids, bucket_start: time((@since / MINUTE) * MINUTE)...time(@until)).select(:id, :measurement_id, :bucket_start, :sample_count).find_each do |row|
        missing << row.measurement_id if counts.fetch([ row.measurement_id, us(row.bucket_start) ], 0) < row.sample_count
      end
      missing.uniq
    end

    def represented_counts(ids, from, to)
      MeasurementSample.where(measurement_id: ids, rolled_up: true, recorded_at: time(from)...time(to))
        .group(:measurement_id, Arel.sql("date_trunc('minute', recorded_at)"))
        .count.to_h { |(id, minute), count| [ [ id, us(minute) ], count ] }
    end

    def raw_points(ids)
      return [] if ids.empty?
      interior = MeasurementSample.where(measurement_id: ids, recorded_at: time(@since)...time(@until)).find_each.map { |s| self.class.sample(s) }
      # One index-backed lookup per direction and measurement, in one database query.
      connection = MeasurementSample.connection
      values = ids.map { |id| "(#{Integer(id)})" }.join(", ")
      since = connection.quote(time(@since))
      till = connection.quote(time(@until))
      context = MeasurementSample.find_by_sql(<<~SQL)
        SELECT sample.* FROM (VALUES #{values}) AS selected(measurement_id)
        CROSS JOIN LATERAL (
          (SELECT * FROM measurement_samples WHERE measurement_id = selected.measurement_id AND recorded_at < #{since}
           ORDER BY recorded_at DESC, id DESC LIMIT 1)
          UNION ALL
          (SELECT * FROM measurement_samples WHERE measurement_id = selected.measurement_id AND recorded_at >= #{till}
           ORDER BY recorded_at ASC, id ASC LIMIT 1)
        ) AS sample
      SQL
      interior.concat(context.map { |sample| self.class.sample(sample) })
    end

    def bucket_points(ids, duration, fixed: false)
      return [] if ids.empty?
      reducer = Reducer.new
      minute_start = (@since / MINUTE) * MINUTE
      last_minute = ((@until - 1) / MINUTE) * MINUTE
      represented = [ minute_start, last_minute ].uniq.each_with_object({}) do |minute, counts|
        counts.merge!(represented_counts(ids, minute, minute + MINUTE))
      end
      edges = {}
      use_rollups = duration >= MINUTE || fixed
      if use_rollups
        boundary_minutes = [ minute_start, last_minute ].uniq
        MeasurementRollup.where(measurement_id: ids, bucket_start: boundary_minutes.map { |minute| time(minute) }).select(:measurement_id, :bucket_start, :sample_count).each do |row|
          minute = us(row.bucket_start)
          next unless minute < @since || minute + MINUTE > @until
          edges[[ row.measurement_id, minute ]] = represented.fetch([ row.measurement_id, minute ], 0) >= row.sample_count ? :raw : :summary
        end
      end
      interval = lambda do |id, timestamp|
        left, right = fixed ? [ @since, @until ] : [ [ (timestamp / duration) * duration, @since ].max, [ ((timestamp / duration) + 1) * duration, @until ].min ]
        if edges[[ id, minute_start ]] == :summary && left < minute_start + MINUTE && right > minute_start
          left = [ left, minute_start + MINUTE ].max
        end
        if edges[[ id, last_minute ]] == :summary && left < last_minute + MINUTE && right > last_minute
          right = [ right, last_minute ].min
        end
        [ left, right ]
      end
      if use_rollups
        MeasurementRollup.where(measurement_id: ids, bucket_start: time(minute_start)...time(@until)).select(:id, :measurement_id, :bucket_start, :sample_count, :summaries).find_each do |row|
          id = row.measurement_id
          minute = us(row.bucket_start)
          edge = edges[[ id, minute ]]
          next if edge == :raw
          left, right = edge == :summary ? [ minute, minute + MINUTE ] : interval.call(id, minute)
          row.summaries.each do |summary|
            reducer.add(id, left, right, summary, summary.fetch("statistics", {}), tier: "summary")
          end
        end
      end
      # Include full boundary minutes when a summary must represent a partial interval.
      from = minute_start
      to = ((@until + MINUTE - 1) / MINUTE) * MINUTE
      scope = MeasurementSample.where(measurement_id: ids, recorded_at: time(from)...time(to))
      if use_rollups
        table = MeasurementSample.arel_table
        represented_edges = edges.select { |_, mode| mode == :raw }.keys.map do |id, minute|
          table[:measurement_id].eq(id).and(table[:recorded_at].gteq(time(minute))).and(table[:recorded_at].lt(time(minute + MINUTE)))
        end
        condition = represented_edges.reduce(table[:rolled_up].eq(false)) { |memo, edge| memo.or(edge) }
        scope = scope.where(condition)
      end
      scope.find_each do |sample|
        timestamp = us(sample.recorded_at)
        minute = (timestamp / MINUTE) * MINUTE
        edge = edges[[ sample.measurement_id, minute ]]
        next if edge != :summary && (timestamp < @since || timestamp >= @until)
        left, right = edge == :summary ? [ minute, minute + MINUTE ] : interval.call(sample.measurement_id, timestamp)
        value = sample.snapshot["value"]
        stats = if value.nil?
          { "count" => 0, "null_count" => 1 }
        elsif sample.snapshot["value_type"] == "boolean"
          { "count" => 1, "true_fraction" => value ? 1 : 0 }
        else
          { "count" => 1, "min" => value, "max" => value, "mean" => value }
        end
        reducer.add(sample.measurement_id, left, right, sample.snapshot, stats, tier: "raw", last: value, last_known: true, order: [ timestamp, sample.id ])
      end
      reducer.points
    end
  end
end
