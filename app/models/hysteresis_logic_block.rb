class HysteresisLogicBlock < LogicBlock
  MODES = %w[active_high active_low].freeze

  validate :mode_is_valid

  def required_input_names
    %w[value low_limit high_limit]
  end

  def mode
    config["mode"] || "active_high"
  end

  def active_low?
    mode == "active_low"
  end

  def initial_output
    config.key?("initial_output") ? config["initial_output"] : false
  end

  def evaluate_logic(input_values, previous_state, **)
    prior_output = previous_state.key?("output") ? previous_state["output"] : initial_output
    prior_output = initial_output if prior_output.nil?
    retained_state = previous_state.merge("output" => truthy?(prior_output))
    return [ nil, retained_state ] if input_values.values_at("value", "low_limit", "high_limit").any?(&:nil?)

    value = numeric(input_values["value"])
    low_limit = numeric(input_values["low_limit"])
    high_limit = numeric(input_values["high_limit"])

    output = if active_low?
      if value <= low_limit
        true
      elsif value >= high_limit
        false
      else
        truthy?(prior_output)
      end
    else
      if value >= high_limit
        true
      elsif value <= low_limit
        false
      else
        truthy?(prior_output)
      end
    end

    [ output, previous_state.merge("output" => output) ]
  end

  private

  def mode_is_valid
    errors.add(:config, "mode must be active_high or active_low") unless MODES.include?(mode)
  end
end
