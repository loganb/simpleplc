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

  def value
    latest_input_value("value")
  end

  def low_limit
    latest_input_value("low_limit")
  end

  def high_limit
    latest_input_value("high_limit")
  end

  def evaluate_logic(input_values, previous_state)
    value = input_values["value"].to_f
    low_limit = input_values["low_limit"].to_f
    high_limit = input_values["high_limit"].to_f
    prior_output = previous_state.key?("output") ? previous_state["output"] : initial_output

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
