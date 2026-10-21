module Logic
  class BlockEvaluator
    def self.evaluate!(block, trace:, recorded_at: trace.recorded_at, context: nil)
      new(block, trace: trace, recorded_at: recorded_at, context: context).evaluate!
    end

    def initialize(block, trace:, recorded_at:, context:)
      @block = block
      @trace = trace
      @recorded_at = recorded_at
      @context = context || EvaluationContext.new(trace: trace)
    end

    def evaluate!
      input_values = block.input_expressions.to_h.transform_values do |expression|
        Expression.evaluate(expression, context: context)
      end
      previous_state = previous_result&.fetch("state", nil) || {}
      value, state = block.evaluate_logic(input_values, previous_state, recorded_at: recorded_at)

      result_payload(block.trace_value(value), state, input_values)
    end

    private

    attr_reader :block, :trace, :recorded_at, :context

    # The prior evaluation's result. During an evaluation the instance's state
    # row still holds it; TraceEvaluator writes the new results only at the end.
    def previous_result
      trace.logic_instance.result_for(block)
    end

    def result_payload(value, state, input_values)
      {
        "id" => block.id,
        "name" => block.name,
        "type" => block.type,
        "value" => value,
        "state" => state,
        "input_values" => input_values,
        "recorded_at" => recorded_at.iso8601
      }
    end
  end
end
