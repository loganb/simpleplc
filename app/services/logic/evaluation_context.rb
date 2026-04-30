module Logic
  class EvaluationContext
    def self.empty
      new
    end

    def initialize(logic_diagram: nil, trace: nil)
      @trace = trace
      @logic_diagram = logic_diagram || trace&.logic_diagram
    end

    def identifier_value(name)
      block = logic_diagram&.logic_blocks&.find_by(name: name)
      measurement = logic_diagram&.measurements&.find_by(name: name)

      raise Expression::Error, "ambiguous reference #{name}" if block && measurement
      return trace_value_for(block) if block
      return trace_value_for(measurement) if measurement

      raise Expression::Error, "unknown name #{name}"
    end

    private

    attr_reader :logic_diagram, :trace

    def trace_value_for(source)
      if trace
        trace.data.find_by(source: source)&.value
      else
        source.latest_trace_datum&.value
      end
    end
  end
end
