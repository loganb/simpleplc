module Logic
  # Rolls raw traces up into one-minute TraceRollups and prunes old history.
  # Called about once a minute by LogicRunner. Work is capped per pass so a
  # backlog (first run, long outage) is cleared across passes without stalling
  # evaluation; run returns true while work remains.
  class HistoryMaintenance
    RAW_RETENTION = 48.hours
    ROLLUP_RETENTION = 2.years
    # Minutes older than this are complete; the rest may still receive traces.
    GRACE = 1.minute
    MAX_ROLLUP_MINUTES = 30
    PRUNE_BATCH = 5_000
    MAX_PRUNE_BATCHES = 20

    def run(now: Time.current)
      backlog = false
      LogicInstance.find_each do |instance|
        backlog |= roll_up(instance, now)
        backlog |= prune_traces(instance, now)
      end
      Measurement.find_each do |measurement|
        backlog |= roll_up_measurement(measurement, now)
        backlog |= prune_measurement_samples(measurement, now)
      end
      backlog |= prune_in_batches(MeasurementRollup.where(bucket_start: ...(now - ROLLUP_RETENTION)))
      prune_rollups(now) || backlog
    end

    private

    def roll_up(instance, now)
      limit = (now - GRACE).beginning_of_minute
      traces = instance.traces
      horizon = rolled_up_until(instance)
      traces = traces.where(recorded_at: horizon..) if horizon

      first = traces.where(recorded_at: ...limit).minimum(:recorded_at)
      return false unless first

      window_start = first.beginning_of_minute
      window_end = [ limit, window_start + MAX_ROLLUP_MINUTES.minutes ].min
      samples = traces.where(recorded_at: window_start...window_end).order(:recorded_at, :id).pluck(:recorded_at, :results)
      rows = samples.group_by { |recorded_at, _| recorded_at.beginning_of_minute }.map do |bucket_start, minute|
        {
          logic_instance_id: instance.id,
          bucket_start: bucket_start,
          sample_count: minute.size,
          results: TraceRollupBuilder.build(minute.map(&:last))
        }
      end
      ApplicationRecord.async_commit_transaction do
        TraceRollup.insert_all(rows, unique_by: %i[logic_instance_id bucket_start]) if rows.any?
      end
      window_end < limit && traces.exists?(recorded_at: window_end...limit)
    end

    def roll_up_measurement(measurement, now)
      backlog = false
      ApplicationRecord.async_commit_transaction do
        # Sampling takes the same lock, so no point can arrive between reading
        # a minute and marking its points as represented by the rollup.
        measurement.lock!
        limit = (now - GRACE).beginning_of_minute
        samples = measurement.measurement_samples.where(rolled_up: false)
        first = samples.where(recorded_at: ...limit).minimum(:recorded_at)
        next unless first

        window_start = first.beginning_of_minute
        window_end = [ limit, window_start + MAX_ROLLUP_MINUTES.minutes ].min
        points = samples.where(recorded_at: window_start...window_end).order(:recorded_at, :id).limit(PRUNE_BATCH).pluck(:id, :recorded_at, :snapshot)
        minutes = points.group_by { |_, time, _| time.beginning_of_minute }
        existing = measurement.measurement_rollups.where(bucket_start: minutes.keys).index_by(&:bucket_start)
        minutes.each do |bucket, minute|
          late = existing.key?(bucket)
          groups = minute.map(&:last).group_by { |snapshot| snapshot.except("value") }
          summaries = groups.map do |identity, snapshots|
            group = identity.merge("statistics" => TraceRollupBuilder.summarize(snapshots.map { |snapshot| snapshot["value"] }))
            group["late"] = true if late
            group
          end
          if late
            rollup = existing.fetch(bucket)
            rollup.update!(sample_count: rollup.sample_count + minute.size, summaries: rollup.summaries + summaries)
          else
            MeasurementRollup.create!(measurement_id: measurement.id, bucket_start: bucket, sample_count: minute.size, summaries: summaries)
          end
        end
        MeasurementSample.where(id: points.map(&:first)).update_all(rolled_up: true) if points.any?
        backlog = samples.exists?(recorded_at: ...limit)
      end
      backlog
    end

    def measurement_rollup_horizon(measurement)
      newest = measurement.measurement_rollups.maximum(:bucket_start)
      newest && newest + 1.minute
    end

    def prune_measurement_samples(measurement, now)
      horizon = measurement_rollup_horizon(measurement)
      return false unless horizon
      prune_in_batches(measurement.measurement_samples.where(rolled_up: true, recorded_at: ...[ now - RAW_RETENTION, horizon ].min))
    end

    # Raw traces are deleted only before this instant: every minute up to it
    # that holds traces has a rollup. Read again after roll_up, which moves it.
    def rolled_up_until(instance)
      newest = instance.trace_rollups.maximum(:bucket_start)
      newest && newest + TraceRollup::BUCKET
    end

    def prune_traces(instance, now)
      horizon = rolled_up_until(instance)
      return false unless horizon

      limit = [ now - RAW_RETENTION, horizon ].min
      prune_in_batches(instance.traces.where(recorded_at: ...limit))
    end

    def prune_rollups(now)
      prune_in_batches(TraceRollup.where(bucket_start: ...(now - ROLLUP_RETENTION)))
    end

    # Deletes in PRUNE_BATCH batches, oldest id first; true if it stopped at
    # MAX_PRUNE_BATCHES with rows left.
    def prune_in_batches(scope)
      scope.in_batches(of: PRUNE_BATCH).each_with_index do |batch, index|
        return true if index == MAX_PRUNE_BATCHES

        ApplicationRecord.async_commit_transaction { batch.delete_all }
      end
      false
    end
  end
end
