class HardwareScan
  class Cancelled < StandardError; end
  class Interrupted < StandardError; end
  MAX_SECONDS = 900
  PROFILE_KEYS = %w[baud_rate data_bits stop_bits parity].freeze

  def self.request(interface, token, options)
    raise HardwareError.new("A request ID is required", status: :unprocessable_entity) unless token.is_a?(String) && token.size.between?(1, 100)
    interface.with_lock do
      return interface if interface.scan_request_id == token
      raise HardwareError, "Disable the interface before scanning" if interface.enabled?
      raise HardwareError, "A scan is already pending or running" if interface.scan_active?
      options = options.stringify_keys
      first = Integer(options.fetch("first_address", 1).to_s, 10)
      last = Integer(options.fetch("last_address", 247).to_s, 10)
      raise ArgumentError, "Address range must be within 1–247" unless (1..247).cover?(first) && (first..247).cover?(last)
      profiles = options.fetch("profiles", [ interface.attributes.slice(*PROFILE_KEYS) ])
      raise ArgumentError, "Select between one and four serial profiles" unless profiles.is_a?(Array) && profiles.size.between?(1, 4) && profiles.all? { |profile| profile.is_a?(Hash) }
      profiles = profiles.map do |profile|
        p = interface.attributes.slice(*PROFILE_KEYS).merge(profile.stringify_keys.slice(*PROFILE_KEYS))
        %w[baud_rate data_bits stop_bits].each { |key| p[key] = Integer(p[key]) }
        raise ArgumentError, "Invalid serial profile" unless [ 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200 ].include?(p["baud_rate"]) && (5..8).cover?(p["data_bits"]) && [ 1, 2 ].include?(p["stop_bits"]) && HostInterface::PARITIES.include?(p["parity"])
        p
      end.uniq
      interface.update!(scan_state: "requested", scan_request_id: token,
        scan_options: { first_address: first, last_address: last, profiles: profiles, port: interface.port, probe_version: 1 },
        scan_results: { schema_version: 1, completed: 0, total: (last - first + 1) * profiles.size, devices: [], diagnostics: [] },
        scan_cancel_requested: false, scan_requested_at: Time.current, scan_updated_at: Time.current,
        scan_started_at: nil, scan_finished_at: nil)
    end
    interface
  rescue ArgumentError, TypeError => e
    raise HardwareError.new(e.message, status: :unprocessable_entity)
  end

  def self.cancel(interface, token)
    interface.with_lock do
      raise HardwareError, "This scan has been replaced; reload" unless interface.scan_request_id == token
      if interface.scan_state == "requested"
        interface.update!(scan_state: "cancelled", scan_cancel_requested: true, scan_finished_at: Time.current, scan_updated_at: Time.current)
      elsif interface.scan_state == "scanning"
        interface.update!(scan_cancel_requested: true)
      end
    end
    interface
  end

  def initialize(interface, stopping: -> { false })
    @interface, @stopping = interface, stopping
  end

  # A full synchronous sweep. The advisory lock identifies a live executor,
  # including while all normal poller heartbeats are delayed by the scan.
  def run
    HostInterface.connection_pool.with_connection do |db|
      return unless db.select_value("SELECT pg_try_advisory_lock(78124, #{@interface.id.to_i})")
      begin
        @interface.reload
        return unless @interface.scan_active?
        if @interface.scan_state == "scanning"
          @interface.update!(scan_state: "interrupted", scan_finished_at: Time.current, scan_updated_at: Time.current)
          return
        end
        @token = @interface.scan_request_id
        @results = @interface.scan_results.deep_dup
        @options = @interface.scan_options.deep_dup
        @deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + MAX_SECONDS
        @interface.with_lock do
          return unless !@interface.enabled? && @interface.scan_state == "requested" && @interface.scan_request_id == @token
          @interface.update!(scan_state: "scanning", scan_started_at: Time.current, scan_updated_at: Time.current)
        end
        perform
      ensure
        db.execute("SELECT pg_advisory_unlock(78124, #{@interface.id.to_i})")
      end
    end
  end

  private

  def checkpoint
    raise Interrupted, "Poller stopped" if @stopping.call
    raise Interrupted, "Scan exceeded #{MAX_SECONDS} seconds" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > @deadline
    @interface.reload
    raise Cancelled, "Scan cancelled" if @interface.scan_request_id != @token || @interface.scan_cancel_requested || @interface.enabled?
  end

  def perform
    lock = SerialBusLock.acquire(@options.fetch("port"))
    @interface.with_lock do
      @interface.identify_port
      @options["port"] = @interface.port
      @interface.update!(scan_options: @options)
    end
    @options.fetch("profiles").each_with_index do |profile, profile_index|
      checkpoint
      client = ModBus::RTUClient.connect(@options.fetch("port"), profile.fetch("baud_rate"),
        data_bits: profile.fetch("data_bits"), stop_bits: profile.fetch("stop_bits"), parity: profile.fetch("parity").to_sym)
      client.read_retry_timeout = 0.2
      client.read_retries = 1
      begin
        (@options.fetch("first_address")..@options.fetch("last_address")).each do |address|
          checkpoint
          probe = Drivers::Probe.new(client.with_slave(address), checkpoint: method(:checkpoint))
          probe.read(:holding_registers, 0)
          probe.read(:input_registers, 0) unless probe.responding?
          if probe.responding?
            result = { "address" => address, "profile_index" => profile_index, "profile" => profile,
              "observed_at" => Time.current.iso8601, "driver_support" => [] }
            @results["devices"] << result
            Drivers::Registry.all.each do |driver|
              result["driver_support"] << { "driver" => driver.name, "support" => "maybe", "reason" => "Check not completed", "evidence" => [] }
            end
            Drivers::Registry.all.each_with_index do |driver, index|
              checkpoint
              verdict = begin
                driver.device_support(probe)
              rescue Cancelled, Interrupted, IOError, SystemCallError
                raise
              rescue StandardError => e
                probe.verdict("maybe", "Check failed: #{e.class}: #{e.message}")
              end
              result["driver_support"][index] = verdict.stringify_keys.merge("driver" => driver.name)
            end
            result["evidence"] = probe.evidence
          elsif probe.evidence.any? { |r| r[:status] == "error" }
            @results["diagnostics"] << { address: address, profile_index: profile_index, evidence: probe.evidence }
          end
          @results["completed"] += 1
          persist if @results["completed"] % 5 == 0 || probe.responding?
        end
      ensure
        client.close
      end
    end
    finish("completed")
  rescue Cancelled => e
    finish("cancelled", e.message)
  rescue Interrupted => e
    finish("interrupted", e.message)
  rescue StandardError => e
    finish("failed", "#{e.class}: #{e.message}")
  ensure
    lock&.close
  end

  def persist(state = nil, error = nil)
    @interface.reload
    @interface.with_lock do
      return unless @interface.scan_request_id == @token
      @results["error"] = error if error
      fields = { scan_results: @results, scan_updated_at: Time.current }
      fields.merge!(scan_state: state, scan_finished_at: Time.current) if state
      @interface.update!(fields)
    end
  end

  def finish(state, error = nil) = persist(state, error)
end
