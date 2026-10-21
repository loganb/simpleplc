# Executes a DeviceScan: probes each address in its range at the bus's own
# serial settings and records which drivers could be talking to whatever answers.
# Run by the poller, synchronously, for a disabled bus with a pending scan.
# Never writes to a device. See claude/device-management-simplify.md.
class HardwareScan
  class Cancelled < StandardError; end
  class Interrupted < StandardError; end

  # How often progress is written when nothing has answered.
  PROGRESS_EVERY = 5

  # A running scan has an executor by definition, so any found when the poller
  # starts (or is stopping) was abandoned.
  def self.fail_running(reason)
    DeviceScan.where(state: "running").find_each do |scan|
      scan.update!(state: "failed", error: reason, finished_at: Time.current)
    end
  end

  def initialize(scan, stopping: -> { false })
    @scan, @stopping = scan, stopping
    @bus = scan.host_interface
    @results = []
    @completed = 0
  end

  def run
    return unless claim
    perform
  end

  private

  # pending -> running, unless it was cancelled (or the bus turned back on) first.
  def claim
    @scan.with_lock do
      return false unless @scan.state == "pending" && !@bus.reload.enabled?
      @scan.update!(state: "running", started_at: Time.current)
    end
    true
  end

  def checkpoint
    raise Interrupted, "Poller stopped" if @stopping.call
    # Uncached: the poller's reloader wrap enables the query cache, which would
    # otherwise hide a cancel until the next progress write.
    raise Cancelled, "Scan cancelled" if DeviceScan.uncached { DeviceScan.where(id: @scan.id).pick(:state) } == "cancelled"
  end

  def perform
    lock = SerialBusLock.acquire(@bus.port)
    @bus.with_lock do
      @bus.identify_port
      @bus.save! if @bus.changed?
    end
    client = @bus.modbus_client
    client.read_retry_timeout = 0.2
    client.read_retries = 1
    begin
      client.flush_line
      (@scan.first_address..@scan.last_address).each do |address|
        checkpoint
        probe = Drivers::Probe.new(client.with_slave(address), checkpoint: method(:checkpoint))
        probe.read(:holding_registers, 0)
        probe.read(:input_registers, 0) unless probe.responding?
        @results << result_for(address, probe) if probe.responding?
        @completed += 1
        persist if probe.responding? || (@completed % PROGRESS_EVERY).zero?
      end
    ensure
      client.close
    end
    persist(state: "done")
  rescue Cancelled
    persist
  rescue Interrupted => e
    persist(state: "failed", error: e.message)
  rescue StandardError => e
    persist(state: "failed", error: "#{e.class}: #{e.message}")
  ensure
    lock&.close
  end

  def result_for(address, probe)
    support = Drivers::Registry.all.map do |driver|
      checkpoint
      verdict = begin
        driver.device_support(probe)
      rescue Cancelled, Interrupted, IOError, SystemCallError
        raise
      rescue StandardError => e
        probe.verdict("maybe", "Check failed: #{e.class}: #{e.message}")
      end
      verdict.stringify_keys.merge("driver" => driver.name)
    end
    { "address" => address, "observed_at" => Time.current.iso8601, "driver_support" => support }
  end

  # Re-reads under a row lock, so a cancel that landed meanwhile keeps its state
  # (the results gathered so far are still kept).
  def persist(state: nil, error: nil)
    @scan.with_lock do
      fields = { completed: @completed, results: @results }
      fields.merge!(state: state, error: error, finished_at: Time.current) if state && @scan.state == "running"
      @scan.update!(fields)
    end
  end
end
