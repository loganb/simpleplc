module Logic
  class OutputEvaluator
    def self.evaluate!(output_block, trace:, recorded_at: trace.recorded_at, context: nil)
      new(output_block, trace: trace, recorded_at: recorded_at, context: context).evaluate!
    end

    def initialize(output_block, trace:, recorded_at:, context:)
      @output_block = output_block
      @trace = trace
      @recorded_at = recorded_at
      @context = context || EvaluationContext.new(trace: trace)
    end

    def evaluate!
      input_value = Expression.evaluate(output_block.input_expression, context: context)
      desired_output = truthy?(input_value)
      enabled = trace.logic_diagram.output_enable? && output_block.output_enable?
      state = {
        "desired_output" => desired_output,
        "effective_output" => enabled ? desired_output : nil,
        "diagram_output_enable" => trace.logic_diagram.output_enable?,
        "output_enable" => output_block.output_enable?,
        "write_pending" => enabled,
        "write_skipped_reason" => enabled ? nil : skipped_reason
      }

      create_datum(input_value, desired_output, state).tap { output_block.clear_memery_cache! }
    end

    private

    attr_reader :output_block, :trace, :recorded_at, :context

    def create_datum(input_value, desired_output, state)
      output_block.data.create!(
        trace: trace,
        value: desired_output ? 1.0 : 0.0,
        state: state,
        input_values: { "input" => input_value },
        recorded_at: recorded_at
      )
    end

    def skipped_reason
      return "diagram_output_disabled" unless trace.logic_diagram.output_enable?
      return "output_disabled" unless output_block.output_enable?
    end

    def truthy?(value)
      value != nil && value != false && value != 0
    end
  end
end
