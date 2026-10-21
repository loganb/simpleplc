class LogicRunner
  class AlreadyRunning < StandardError; end

  # Longest sleep, so new, edited and deleted instances are noticed promptly.
  CHECK_INTERVAL = 1.second
  MAINTENANCE_INTERVAL = 1.minute
  ERROR_RETRY_INTERVAL = 10.seconds
  ADVISORY_LOCK_NAMESPACE = 78_125
  ADVISORY_LOCK_ID = 1

  # An instance's next evaluation, and the update_period it was computed for.
  Schedule = Data.define(:due_at, :period)

  def initialize(sleeper: ->(seconds) { sleep(seconds) })
    @sleeper = sleeper
    @retry_after = {}
    # instance id => Schedule
    @schedules = {}
    @next_maintenance_at = nil
    @stopping = false
  end

  def run
    Rails.logger.info "LogicRunner starting (check interval: #{CHECK_INTERVAL}s)"
    trap_signals

    LogicInstance.connection_pool.with_connection do |connection|
      with_advisory_lock(connection) do
        until @stopping
          Rails.application.reloader.wrap do
            run_cycle
            maintain_if_due
          end
          sleep_for = seconds_until_next_wakeup(Time.current)
          @sleeper.call(sleep_for) if sleep_for.positive? && !@stopping
        end
      end
    end
  end

  def run_cycle(now: Time.current)
    instances = LogicInstance.includes(:logic_instance_state).order(:id).to_a
    discard_state_for_deleted_instances(instances)

    instances.each do |instance|
      next if retry_delayed?(instance, now)

      due = due_at(instance)
      next if due && due > now

      # Async commit: a power cut may lose the last fraction of a second.
      ApplicationRecord.async_commit_transaction { Logic::InstanceEvaluator.evaluate!(instance, recorded_at: now) }
      @schedules[instance.id] = Schedule.new(following_due(due, instance, now), instance.update_period)
      @retry_after.delete(instance.id)
    rescue ActiveRecord::RecordNotFound
      @retry_after.delete(instance.id)
      @schedules.delete(instance.id)
    rescue StandardError => e
      @retry_after[instance.id] = now + ERROR_RETRY_INTERVAL
      Rails.logger.error "LogicRunner: error evaluating instance #{instance.id} (#{instance.name}): #{e.class}: #{e.message}"
    end
  end

  # Rollup and pruning, at most once per MAINTENANCE_INTERVAL (sooner while
  # there is a backlog). Errors are logged and never stop evaluation.
  def maintain_if_due(now: Time.current)
    return if @next_maintenance_at && now < @next_maintenance_at

    backlog = Logic::HistoryMaintenance.new.run(now: now)
    @next_maintenance_at = now + (backlog ? CHECK_INTERVAL : MAINTENANCE_INTERVAL)
  rescue StandardError => e
    @next_maintenance_at = now + MAINTENANCE_INTERVAL
    Rails.logger.error "LogicRunner: history maintenance failed: #{e.class}: #{e.message}"
  end

  # Time to sleep: until the earliest scheduled evaluation, at most CHECK_INTERVAL.
  def seconds_until_next_wakeup(now)
    wakeups = @schedules.map { |id, schedule| [ schedule.due_at, @retry_after[id] ].compact.max }
    earliest = wakeups.min
    return CHECK_INTERVAL.to_f unless earliest

    (earliest - now).clamp(0, CHECK_INTERVAL.to_f)
  end

  def stop!
    @stopping = true
  end

  private

  # When the instance is next due. The schedule is remembered between cycles;
  # without one (new instance, restart, edited period) it derives from the
  # state row. Nil means never evaluated: due at once.
  def due_at(instance)
    schedule = @schedules[instance.id]
    return schedule.due_at if schedule&.period == instance.update_period

    due = instance.next_due_at
    if due
      @schedules[instance.id] = Schedule.new(due, instance.update_period)
    else
      @schedules.delete(instance.id)
    end
    due
  end

  # The next slot on the instance's grid after now: no drift, no catching up.
  def following_due(due, instance, now)
    return now + instance.update_interval unless due

    due + instance.update_interval * (((now - due) / instance.update_period).floor + 1)
  end

  def retry_delayed?(instance, now)
    @retry_after.fetch(instance.id, now) > now
  end

  def discard_state_for_deleted_instances(instances)
    ids = instances.map(&:id)
    @retry_after.slice!(*ids)
    @schedules.slice!(*ids)
  end

  def with_advisory_lock(connection)
    lock_sql = "SELECT pg_try_advisory_lock(#{ADVISORY_LOCK_NAMESPACE}, #{ADVISORY_LOCK_ID})"
    unlock_sql = "SELECT pg_advisory_unlock(#{ADVISORY_LOCK_NAMESPACE}, #{ADVISORY_LOCK_ID})"
    acquired = connection.select_value(lock_sql)
    raise AlreadyRunning, "another logic runner already holds the database lock" unless acquired

    yield
  ensure
    connection.execute(unlock_sql) if acquired
  end

  def trap_signals
    %w[INT TERM].each do |signal|
      Signal.trap(signal) { stop! }
    end
  end
end
