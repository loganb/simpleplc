module Logic
  class BlockEvaluator
    def self.evaluate!(block, recorded_at: Time.current, context: nil)
      new(block, recorded_at: recorded_at, context: context).evaluate!
    end

    def initialize(block, recorded_at:, context:)
      @block = block
      @recorded_at = recorded_at
      @context = context || EvaluationContext.new(logic_diagram: block.logic_diagram)
    end

    def evaluate!
      input_values = block.input_expressions.to_h.transform_values do |expression|
        Expression.evaluate(expression, context: context)
      end
      previous_state = block.latest_datum&.state || {}
      value, state = block.evaluate_logic(input_values, previous_state)

      block.data.create!(
        value: value ? 1.0 : 0.0,
        state: state,
        input_values: input_values,
        recorded_at: recorded_at
      ).tap { block.clear_memery_cache! }
    end

    private

    attr_reader :block, :recorded_at, :context
  end
end
