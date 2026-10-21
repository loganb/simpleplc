module Logic
  class MeasurementHistoryMaintenance
    RAW_RETENTION = 48.hours
    ROLLUP_RETENTION = 2.years
    GRACE = 1.minute
    MAX_ROLLUP_MINUTES = 30
    PRUNE_BATCH = 5_000
    MAX_PRUNE_BATCHES = 20

    def run(now: Time.current)
      backlog = false
      Measurement.find_each do |measurement|
        backlog |= roll_up(measurement, now)
        backlog |= prune_samples(measurement, now)
      end
      prune_rollups(now) || backlog
    end

    private

    def roll_up(measurement, now)
      limit = (now - GRACE).beginning_of_minute
      samples = measurement.measurement_samples
      horizon = rolled_up_until(measurement)
      samples = samples.where(recorded_at: horizon..) if horizon
      first = samples.where(recorded_at: ...limit).minimum(:recorded_at)
      return false unless first

      window_start = first.beginning_of_minute
      window_end = [ limit, window_start + MAX_ROLLUP_MINUTES.minutes ].min
      rows = samples.where(recorded_at: window_start...window_end)
        .order(:recorded_at, :id).pluck(:recorded_at, :value)
        .group_by { |recorded_at, _value| recorded_at.beginning_of_minute }
        .map do |bucket_start, minute|
          {
            measurement_id: measurement.id,
            bucket_start: bucket_start,
            sample_count: minute.size,
            stats: MeasurementRollupBuilder.build(minute.map(&:last))
          }
        end
      ApplicationRecord.async_commit_transaction do
        MeasurementRollup.insert_all(rows, unique_by: %i[measurement_id bucket_start]) if rows.any?
      end
      window_end < limit && samples.exists?(recorded_at: window_end...limit)
    end

    def rolled_up_until(measurement)
      newest = measurement.measurement_rollups.maximum(:bucket_start)
      newest && newest + MeasurementRollup::BUCKET
    end

    def prune_samples(measurement, now)
      horizon = rolled_up_until(measurement)
      return false unless horizon

      limit = [ now - RAW_RETENTION, horizon ].min
      prune_in_batches(measurement.measurement_samples.where(recorded_at: ...limit))
    end

    def prune_rollups(now)
      prune_in_batches(MeasurementRollup.where(bucket_start: ...(now - ROLLUP_RETENTION)))
    end

    def prune_in_batches(scope)
      scope.in_batches(of: PRUNE_BATCH).each_with_index do |batch, index|
        return true if index == MAX_PRUNE_BATCHES

        ApplicationRecord.async_commit_transaction { batch.delete_all }
      end
      false
    end
  end
end
