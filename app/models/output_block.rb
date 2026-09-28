class OutputBlock < ApplicationRecord
  include ObservesRecordChanges
  include LocksHardwareReference
  include Memery

  belongs_to :logic_diagram
  belongs_to :device

  validates :name, presence: true
  validates :name, uniqueness: { scope: :logic_diagram_id }
  validates :name, format: {
    with: /\A[A-Za-z_]\w*\z/,
    message: "must be an expression-safe identifier"
  }
  validates :input_expression, presence: true
  validates :channel, numericality: { only_integer: true, greater_than_or_equal_to: 1 }
  validate :input_expression_is_valid
  validate :referenced_names_exist
  validate :device_supports_binary_output_channel

  memoize def latest_result
    logic_diagram.latest_trace&.result_for(self)
  end

  def desired_output
    return nil unless latest_result

    value = latest_result.fetch("value", nil)
    return nil if value.nil?

    value.nonzero? ? true : false
  end

  def effective_output
    return nil unless logic_diagram.output_enable? && output_enable? && !desired_output.nil?

    desired_output
  end

  def write_pending?
    !effective_output.nil?
  end

  private

  def input_expression_is_valid
    @parsed_references = []
    return if input_expression.blank?

    @parsed_references = Logic::Expression.references(input_expression.to_s)[:identifiers]
  rescue Logic::Expression::Error => e
    errors.add(:input_expression, e.message)
  end

  def referenced_names_exist
    return unless logic_diagram && @parsed_references

    blocks_by_name = logic_diagram.logic_blocks.where(name: @parsed_references).index_by(&:name)
    measurements_by_name = logic_diagram.measurements.where(name: @parsed_references).index_by(&:name)

    @parsed_references.each do |name|
      referenced_block = blocks_by_name[name]
      referenced_measurement = measurements_by_name[name]

      if referenced_block && referenced_measurement
        errors.add(:input_expression, "reference #{name} is ambiguous")
      elsif referenced_block.nil? && referenced_measurement.nil?
        errors.add(:input_expression, "references unknown name #{name}")
      end
    end
  end

  def device_supports_binary_output_channel
    return if device.blank?

    binary_outputs = device.outputs.select { |output| output[:value_type] == "boolean" }
    if binary_outputs.empty?
      errors.add(:device, "driver does not support binary output writes")
    elsif channel.present? && !device.supports_binary_output?(channel)
      channels = binary_outputs.map { |output| output[:channel] }
      errors.add(:channel, "must be between #{channels.min} and #{channels.max}")
    end
  end
end
