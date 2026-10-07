module Logic
  class TraceEvaluator
    def self.evaluate!(trace)
      new(trace).evaluate!
    end

    def initialize(trace)
      @trace = trace
      @instance = trace.logic_instance
      @diagram = instance.logic_diagram
    end

    def evaluate!
      ActiveRecord::Base.transaction do
        @results = Trace.empty_results
        snapshot_inputs!
        evaluate_blocks!
        evaluate_outputs!
        trace.update!(results: results)
      end
      trace
    end

    private

    attr_reader :trace, :instance, :diagram, :results

    def snapshot_inputs!
      # Instances are long-lived in the runner. Query bindings for every trace
      # so a live edit takes effect on the next evaluation rather than waiting
      # for an association cache to be discarded.
      bindings = LogicInputBinding.where(logic_instance_id: instance.id).index_by(&:logic_input_id)
      diagram.logic_inputs.order(:id).each do |input|
        binding = bindings[input.id]
        results["logic_inputs"][input.id.to_s] = result_payload(
          input,
          value: binding&.trace_value,
          state: {
            "binding_id" => binding&.id,
            "source_kind" => binding&.source_kind
          },
          input_values: {}
        )
      end
    end

    def evaluate_blocks!
      context = EvaluationContext.new(trace: trace, results: results)
      diagram.logic_blocks.order(:stratum, :id).each do |block|
        results["logic_blocks"][block.id.to_s] = BlockEvaluator.evaluate!(block, trace: trace, context: context)
      end
    end

    def evaluate_outputs!
      context = EvaluationContext.new(trace: trace, results: results)
      diagram.logic_outputs.order(:id).each do |output|
        results["logic_outputs"][output.id.to_s] = OutputEvaluator.evaluate!(output, trace: trace, context: context)
      end
    end

    def result_payload(source, value:, state:, input_values:)
      {
        "id" => source.id,
        "name" => source.name,
        "value" => value,
        "state" => state,
        "input_values" => input_values,
        "recorded_at" => trace.recorded_at.iso8601
      }
    end
  end
end
