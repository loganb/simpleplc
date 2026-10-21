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
        # The row lock serializes this evaluation with any concurrent one
        # (runner vs. "Compute now") until the transaction commits.
        state = instance.lock_state!
        @results = Trace.empty_results
        # Reloaded per trace so live diagram edits apply on the next evaluation;
        # the loaded associations then serve every lookup below.
        diagram.logic_blocks.reload
        diagram.logic_inputs.reload
        diagram.logic_outputs.reload
        @context = EvaluationContext.new(trace: trace, results: results)
        snapshot_inputs!
        evaluate_blocks!
        evaluate_outputs!
        state.update!(recorded_at: trace.recorded_at, results: results)
        trace.results = results
      end
      trace
    end

    private

    attr_reader :trace, :instance, :diagram, :results, :context

    def snapshot_inputs!
      # Instances are long-lived in the runner. Query bindings for every trace
      # so a live edit takes effect on the next evaluation rather than waiting
      # for an association cache to be discarded.
      bindings = LogicInputBinding.where(logic_instance_id: instance.id).index_by(&:logic_input_id)
      diagram.logic_inputs.each do |input|
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
      diagram.logic_blocks.each do |block|
        results["logic_blocks"][block.id.to_s] = BlockEvaluator.evaluate!(block, trace: trace, context: context)
      end
    end

    def evaluate_outputs!
      diagram.logic_outputs.each do |output|
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
