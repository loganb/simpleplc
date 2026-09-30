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

      result_payload(block.trace_value(value), state, input_values).tap { block.clear_memery_cache! }
    end

    private

    attr_reader :block, :trace, :recorded_at, :context

    def previous_result
      trace.logic_diagram.traces.where.not(id: trace.id).order(recorded_at: :desc, id: :desc).find do |previous_trace|
        previous_trace.result_for(block)
      end&.result_for(block)
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
