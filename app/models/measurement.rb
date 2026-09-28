class Measurement < ApplicationRecord
  include ObservesRecordChanges
  include LocksHardwareReference
  MODES = %w[acquisition simulation].freeze

  belongs_to :logic_diagram
  belongs_to :device, optional: true

  validates :name, presence: true
  validates :name, uniqueness: { scope: :logic_diagram_id }
  validates :name, format: {
    with: /\A[A-Za-z_]\w*\z/,
    message: "must be an expression-safe identifier"
  }
  validates :mode, inclusion: { in: MODES }
  validates :simulation_value, numericality: true, allow_nil: true
  validate :device_input_is_valid

  def simulation?
    mode == "simulation"
  end

  def acquisition?
    mode == "acquisition"
  end

  def latest_result
    logic_diagram.latest_trace&.result_for(self)
  end

  def latest_value
    latest_result&.fetch("value", nil)
  end

  def trace_value
    return simulation_value if simulation?

    normalize_trace_value(device_value)
  end

  private

  def device_input_is_valid
    return unless acquisition?
    return if device.blank? && source_path.blank?

    if device.blank?
      errors.add(:device, "must be selected with a source path")
    elsif source_path.blank?
      errors.add(:source_path, "must be selected with a device")
    elsif !device.supports_input?(source_path)
      errors.add(:source_path, "is not an input supported by the selected device")
    end
  end

  def device_value
    return nil if device.blank? || source_path.blank?

    extract_path(device.current_state&.dig("data"), source_path)
  end

  def extract_path(value, path)
    path.to_s.scan(/[A-Za-z_]\w*|\[\d+\]/).each do |segment|
      return nil if value.nil?

      if segment.start_with?("[")
        value = value[segment[1..-2].to_i] if value.respond_to?(:[])
      else
        value = value[segment] if value.respond_to?(:[])
      end
    end
    value
  end

  def normalize_trace_value(value)
    return 1.0 if value == true
    return 0.0 if value == false
    return value.to_f if value.is_a?(Numeric)
    nil
  end
end
