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

    LogicDiagram.connection_pool.with_connection do |connection|
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
    diagrams = LogicDiagram.order(:id).to_a
    discard_retries_for_deleted_diagrams(diagrams)

    diagrams.each do |diagram|
      next if retry_delayed?(diagram, now)

      diagram.reload
      next unless due?(diagram, now)

      Logic::DiagramEvaluator.evaluate!(diagram, recorded_at: now)
      @retry_after.delete(diagram.id)
    rescue ActiveRecord::RecordNotFound
      @retry_after.delete(diagram.id)
    rescue StandardError => e
      @retry_after[diagram.id] = now + ERROR_RETRY_INTERVAL
      Rails.logger.error "LogicRunner: error evaluating diagram #{diagram.id} (#{diagram.name}): #{e.class}: #{e.message}"
    end
  end

  def stop!
    @stopping = true
  end

  private

  def due?(diagram, now)
    latest_trace = diagram.latest_trace
    latest_trace.nil? || latest_trace.recorded_at + diagram.update_period.seconds <= now
  end

  def retry_delayed?(diagram, now)
    @retry_after.fetch(diagram.id, now) > now
  end

  def discard_retries_for_deleted_diagrams(diagrams)
    @retry_after.slice!(*diagrams.map(&:id))
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
