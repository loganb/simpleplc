class TimerCounterLogicBlock < LogicBlock
  MODES = %w[active_high active_low].freeze

  validate :mode_is_valid

  def required_input_names
    %w[input]
  end

  def mode
    config["mode"] || "active_high"
  end

  def active_low?
    mode == "active_low"
  end

  def evaluate_logic(input_values, previous_state, recorded_at:)
    active_since = previous_state["active_since"]
    return [ nil, previous_state.merge("active_since" => active_since) ] if input_values["input"].nil?

    active = truthy?(input_values["input"])
    active = !active if active_low?
    return [ 0.0, previous_state.merge("active_since" => nil) ] unless active

    active_since ||= recorded_at.iso8601(6)
    elapsed = recorded_at - Time.zone.parse(active_since)
    [ [ elapsed.to_f, 0.0 ].max, previous_state.merge("active_since" => active_since) ]
  end

  private

  def mode_is_valid
    errors.add(:config, "mode must be active_high or active_low") unless MODES.include?(mode)
  end
end
