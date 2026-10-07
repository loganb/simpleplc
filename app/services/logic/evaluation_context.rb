module Logic
  class EvaluationContext
    def self.empty
      new
    end

    def initialize(logic_diagram: nil, trace: nil, results: nil)
      @trace = trace
      @results = results
      @logic_diagram = logic_diagram || trace&.logic_diagram
    end

    def identifier_value(name)
      block = logic_diagram&.logic_blocks&.find_by(name: name)
      input = logic_diagram&.logic_inputs&.find_by(name: name)

      raise Expression::Error, "ambiguous reference #{name}" if block && input
      return trace_value_for(block) if block
      return trace_value_for(input) if input

      raise Expression::Error, "unknown name #{name}"
    end

    private

    attr_reader :logic_diagram, :trace, :results

    def trace_value_for(source)
      if trace
        (results || trace.results).to_h.dig(Trace.results_bucket_for(source), source.id.to_s, "value")
      else
        nil
      end
    end
  end
end
