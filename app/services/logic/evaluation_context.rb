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
      block = blocks_by_name[name]
      input = inputs_by_name[name]

      raise Expression::Error, "ambiguous reference #{name}" if block && input
      return trace_value_for(block) if block
      return trace_value_for(input) if input

      raise Expression::Error, "unknown name #{name}"
    end

    private

    attr_reader :logic_diagram, :trace, :results

    # Indexed from the diagram's loaded associations, so identifiers resolve
    # without a query per lookup.
    def blocks_by_name
      @blocks_by_name ||= Array(logic_diagram&.logic_blocks).index_by(&:name)
    end

    def inputs_by_name
      @inputs_by_name ||= Array(logic_diagram&.logic_inputs).index_by(&:name)
    end

    def trace_value_for(source)
      if trace
        (results || trace.results).to_h.dig(Trace.results_bucket_for(source), source.id.to_s, "value")
      else
        nil
      end
    end
  end
end
