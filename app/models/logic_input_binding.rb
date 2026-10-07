class LogicInputBinding < ApplicationRecord
  include ObservesRecordChanges

  SOURCE_KINDS = %w[device_input fixed_value].freeze

  belongs_to :logic_instance
  belongs_to :logic_input
  belongs_to :device, optional: true

  validates :source_kind, inclusion: { in: SOURCE_KINDS }
  validates :logic_input_id, uniqueness: { scope: :logic_instance_id }
  validate :input_belongs_to_instance_diagram
  validate :source_fields_match_kind
  validate :source_type_is_compatible
  before_save :lock_hardware_reference

  def trace_value
    raw_value = source_kind == "fixed_value" ? fixed_value : device_value
    normalize_value(raw_value)
  end

  private

  def input_belongs_to_instance_diagram
    return if logic_instance.blank? || logic_input.blank?
    return if logic_input.logic_diagram_id == logic_instance.logic_diagram_id

    errors.add(:logic_input, "must belong to the instance's diagram")
  end

  def source_fields_match_kind
    case source_kind
    when "device_input"
      errors.add(:device, "must be selected") if device.blank?
      errors.add(:source_path, "must be selected") if source_path.blank?
      errors.add(:fixed_value, "must be blank for a device input") unless fixed_value.nil?
    when "fixed_value"
      errors.add(:device, "must be blank for a fixed value") if device.present?
      errors.add(:source_path, "must be blank for a fixed value") if source_path.present?
    end
  end

  def source_type_is_compatible
    return if logic_input.blank?

    if source_kind == "fixed_value"
      validate_value_type(fixed_value)
    elsif source_kind == "device_input" && device.present? && source_path.present?
      catalog_input = device.inputs.find { |input| input[:path] == source_path }
      if catalog_input.nil?
        errors.add(:source_path, "is not an input supported by the selected device")
      elsif catalog_input[:value_type] != logic_input.value_type &&
          !(logic_input.value_type == "number" && catalog_input[:value_type] == "boolean")
        errors.add(:source_path, "has type #{catalog_input[:value_type]}, expected #{logic_input.value_type}")
      end
    end
  end

  def validate_value_type(value)
    valid = value.nil? ||
      (logic_input.value_type == "boolean" && [ true, false ].include?(value)) ||
      (logic_input.value_type == "number" && value.is_a?(Numeric))
    errors.add(:fixed_value, "must be a #{logic_input.value_type}") unless valid
  end

  def lock_hardware_reference
    return unless source_kind == "device_input" && device_id

    self.device = Device.lock.find(device_id)
    source_type_is_compatible
    throw :abort if errors.any?
  end

  def device_value
    return nil if device.blank? || source_path.blank?

    value = device.current_state&.dig("data")
    source_path.to_s.scan(/[A-Za-z_]\w*|\[\d+\]/).each do |segment|
      return nil if value.nil?

      value = segment.start_with?("[") ? value[segment[1..-2].to_i] : value[segment] if value.respond_to?(:[])
    end
    value
  end

  def normalize_value(value)
    return nil if value.nil?
    return value == true if logic_input.value_type == "boolean"
    return 1.0 if value == true
    return 0.0 if value == false
    return value.to_f if value.is_a?(Numeric)

    nil
  end
end
