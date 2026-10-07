module Logic
  class OutputEvaluator
    def self.evaluate!(logic_output, trace:, recorded_at: trace.recorded_at, context: nil)
      new(logic_output, trace: trace, recorded_at: recorded_at, context: context).evaluate!
    end

    def initialize(logic_output, trace:, recorded_at:, context:)
      @logic_output = logic_output
      @trace = trace
      @recorded_at = recorded_at
      @context = context || EvaluationContext.new(trace: trace)
    end

    def evaluate!
      input_value = Expression.evaluate(logic_output.input_expression, context: context)
      value = typed_value(input_value)
      binding = trace.logic_instance.logic_output_bindings.find_by(logic_output_id: logic_output.id)
      enabled = !!(trace.logic_instance.output_enable? && binding&.output_enable? && !value.nil?)
      state = {
        "desired_output" => value,
        "effective_output" => enabled ? value : nil,
        "instance_output_enable" => trace.logic_instance.output_enable?,
        "binding_id" => binding&.id,
        "output_enable" => binding&.output_enable?,
        "write_pending" => enabled,
        "write_skipped_reason" => enabled ? nil : skipped_reason(value, binding)
      }

      result_payload(input_value, value, state)
    end

    private

    attr_reader :logic_output, :trace, :recorded_at, :context

    def result_payload(input_value, value, state)
      {
        "id" => logic_output.id,
        "name" => logic_output.name,
        "value" => value,
        "state" => state,
        "input_values" => { "input" => input_value },
        "recorded_at" => recorded_at.iso8601
      }
    end

    def skipped_reason(value, binding)
      return "output_unknown" if value.nil?
      return "output_unbound" unless binding
      return "instance_output_disabled" unless trace.logic_instance.output_enable?
      return "output_disabled" unless binding.output_enable?
    end

    def typed_value(value)
      return nil if value.nil?
      if logic_output.value_type == "number"
        return 1.0 if value == true
        return 0.0 if value == false
        return value.to_f if value.is_a?(Numeric)
        return nil
      end

      value != false && value != 0
    end
  end
end
