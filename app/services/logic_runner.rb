class LogicRunner
  class AlreadyRunning < StandardError; end

  CHECK_INTERVAL = 1.second
  ERROR_RETRY_INTERVAL = 10.seconds
  ADVISORY_LOCK_NAMESPACE = 78_125
  ADVISORY_LOCK_ID = 1

  def initialize(sleeper: ->(seconds) { sleep(seconds) })
    @sleeper = sleeper
    @retry_after = {}
    @stopping = false
  end

  def run
    Rails.logger.info "LogicRunner starting (check interval: #{CHECK_INTERVAL}s)"
    trap_signals

    LogicInstance.connection_pool.with_connection do |connection|
      with_advisory_lock(connection) do
        until @stopping
          cycle_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          Rails.application.reloader.wrap { run_cycle }
          elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - cycle_started_at
          sleep_for = CHECK_INTERVAL - elapsed
          @sleeper.call(sleep_for) if sleep_for.positive? && !@stopping
        end
      end
    end
  end

  def run_cycle(now: Time.current)
    instances = LogicInstance.order(:id).to_a
    discard_retries_for_deleted_instances(instances)

    instances.each do |instance|
      next if retry_delayed?(instance, now)

      instance.reload
      next unless due?(instance, now)

      Logic::InstanceEvaluator.evaluate!(instance, recorded_at: now)
      @retry_after.delete(instance.id)
    rescue ActiveRecord::RecordNotFound
      @retry_after.delete(instance.id)
    rescue StandardError => e
      @retry_after[instance.id] = now + ERROR_RETRY_INTERVAL
      Rails.logger.error "LogicRunner: error evaluating instance #{instance.id} (#{instance.name}): #{e.class}: #{e.message}"
    end
  end

  def stop!
    @stopping = true
  end

  private

  def due?(instance, now)
    latest_trace = instance.latest_trace
    latest_trace.nil? || latest_trace.recorded_at + instance.update_period.seconds <= now
  end

  def retry_delayed?(instance, now)
    @retry_after.fetch(instance.id, now) > now
  end

  def discard_retries_for_deleted_instances(instances)
    @retry_after.slice!(*instances.map(&:id))
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
