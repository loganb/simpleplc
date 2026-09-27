module Drivers
  # No write methods or public slave accessor. Cache only within one address/profile.
  class Probe
    attr_reader :evidence
    def initialize(slave, checkpoint: -> { })
      @slave, @checkpoint, @cache, @evidence = slave, checkpoint, {}, []
    end

    def read(kind, address)
      raise ArgumentError unless %i[holding_registers input_registers].include?(kind)
      @checkpoint.call
      key = [ kind, address ]
      return @cache[key] if @cache.key?(key)
      result = { kind: kind.to_s, address: address.is_a?(Range) ? [ address.begin, address.end ] : address }
      begin
        values = @slave.public_send(kind)[address]
        expected = address.is_a?(Range) ? address.size : 1
        raise ArgumentError, "Malformed register response" unless Array(values).size == expected && Array(values).all? { |v| v.is_a?(Integer) && (0..65535).cover?(v) }
        result.merge!(status: "ok", values: values)
      rescue ModBus::Errors::IllegalFunction, ModBus::Errors::IllegalDataAddress => e
        result.merge!(status: "unsupported", error: e.message)
      rescue ModBus::Errors::ModBusTimeout => e
        result.merge!(status: "timeout", error: e.message)
      rescue ModBus::Errors::ResponseMismatch, ArgumentError => e
        result.merge!(status: "error", error: e.message)
      rescue ModBus::Errors::ModBusException => e
        # Valid slave exception responses still establish presence.
        result.merge!(status: "exception", error: e.message)
      end
      @evidence << result
      @cache[key] = result
    end

    def responding? = evidence.any? { |e| %w[ok unsupported exception].include?(e[:status]) }
    def verdict(support, reason) = { support: support, reason: reason, evidence: evidence.deep_dup }
  end
end
