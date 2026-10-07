class ExpressionLogicBlock < LogicBlock
  def required_input_names
    %w[value]
  end

  # Booleans are valid expression results, so keep them as true/false.
  def trace_value(value)
    value.is_a?(Numeric) ? value.to_f : value
  end

  def evaluate_logic(input_values, _previous_state, **)
    [ input_values["value"], {} ]
  end
end
