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
