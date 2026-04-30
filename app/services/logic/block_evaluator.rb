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
      previous_state = previous_datum&.state || {}
      value, state = block.evaluate_logic(input_values, previous_state)

      block.data.create!(
        trace: trace,
        value: value ? 1.0 : 0.0,
        state: state,
        input_values: input_values,
        recorded_at: recorded_at
      ).tap { block.clear_memery_cache! }
    end

    private

    attr_reader :block, :trace, :recorded_at, :context

    def previous_datum
      block.data.where.not(trace_id: trace.id).order(recorded_at: :desc, id: :desc).first
    end
  end
end
