class LogicOutputBinding < ApplicationRecord
  include ObservesRecordChanges

  TARGET_KINDS = %w[device_output].freeze

  belongs_to :logic_instance
  belongs_to :logic_output
  belongs_to :device

  validates :target_kind, inclusion: { in: TARGET_KINDS }
  validates :logic_output_id, uniqueness: { scope: :logic_instance_id }
  validates :channel, numericality: { only_integer: true, greater_than_or_equal_to: 1 }
  validate :output_belongs_to_instance_diagram
  validate :device_supports_output
  validate :physical_output_has_one_active_owner
  before_save :lock_hardware_reference

  def latest_result
    logic_instance.result_for(logic_output)
  end

  def desired_output
    value = latest_result&.fetch("value", nil)
    return nil if value.nil?
    return value if [ true, false ].include?(value)

    value.nonzero?
  end

  def effective_output
    return nil unless logic_instance.output_enable? && output_enable? && !desired_output.nil?

    desired_output
  end

  def write_pending?
    !effective_output.nil?
  end

  private

  def output_belongs_to_instance_diagram
    return if logic_instance.blank? || logic_output.blank?
    return if logic_output.logic_diagram_id == logic_instance.logic_diagram_id

    errors.add(:logic_output, "must belong to the instance's diagram")
  end

  def device_supports_output
    return if device.blank? || logic_output.blank?

    output = device.outputs.find { |candidate| candidate[:channel] == channel }
    if output.nil?
      errors.add(:channel, "is not an output supported by the selected device")
    elsif output[:value_type] != logic_output.value_type
      errors.add(:channel, "has type #{output[:value_type]}, expected #{logic_output.value_type}")
    end
  end

  def lock_hardware_reference
    return unless device_id

    self.device = Device.lock.find(device_id)
    device_supports_output
    physical_output_has_one_active_owner
    throw :abort if errors.any?
  end

  def physical_output_has_one_active_owner
    return unless logic_instance&.output_enable? && output_enable?
    return if device_id.blank? || channel.blank?

    owners = self.class.joins(:logic_instance)
      .where(device_id: device_id, channel: channel, output_enable: true)
      .where(logic_instances: { output_enable: true })
    owners = owners.where.not(id: id) if persisted?
    return unless owners.exists?

    errors.add(:channel, "is already controlled by an active instance")
  end
end
