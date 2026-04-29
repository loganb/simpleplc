class LatchLogicBlock < LogicBlock
  MODES = %w[latch_high latch_low].freeze
  DOMINANCE_OPTIONS = %w[reset set].freeze

  validate :mode_is_valid
  validate :dominance_is_valid

  def required_input_names
    %w[set reset]
  end

  def mode
    config["mode"] || "latch_high"
  end

  def latch_high?
    mode == "latch_high"
  end

  def dominance
    config["dominance"] || "reset"
  end

  def initial_output
    config.key?("initial_output") ? config["initial_output"] : !latch_high?
  end

  def set
    latest_input_value("set")
  end

  def reset
    latest_input_value("reset")
  end

  def evaluate_logic(input_values, previous_state)
    set = truthy?(input_values["set"])
    reset = truthy?(input_values["reset"])
    prior_output = truthy?(previous_state.key?("output") ? previous_state["output"] : initial_output)

    output = if dominance == "set" && set
      true
    elsif reset
      set
    elsif set
      true
    else
      prior_output
    end

    output = !output unless latch_high?
    [ output, previous_state.merge("output" => output) ]
  end

  private

  def mode_is_valid
    errors.add(:config, "mode must be latch_high or latch_low") unless MODES.include?(mode)
  end

  def dominance_is_valid
    errors.add(:config, "dominance must be reset or set") unless DOMINANCE_OPTIONS.include?(dominance)
  end
end
