class LogicInstance < ApplicationRecord
  include ObservesRecordChanges

  belongs_to :logic_diagram
  has_many :logic_input_bindings, dependent: :destroy
  has_many :logic_output_bindings, dependent: :destroy
  has_many :traces, dependent: :destroy

  validates :name, presence: true, uniqueness: true
  validates :update_period, presence: true,
    numericality: { only_integer: true, greater_than: 0 }
  validate :physical_outputs_have_one_active_owner, if: :output_enable?

  before_validation :lock_output_devices, if: :output_enable?
  before_update :clear_diagram_specific_records, if: :will_save_change_to_logic_diagram_id?

  def latest_trace
    traces.order(recorded_at: :desc, id: :desc).first
  end

  def result_for(source)
    latest_trace&.result_for(source)
  end

  private

  def lock_output_devices
    Device.where(id: logic_output_bindings.select(:device_id)).order(:id).lock.load
  end

  def physical_outputs_have_one_active_owner
    enabled_bindings = logic_output_bindings.where(output_enable: true).to_a
    duplicate_target = enabled_bindings.group_by { |binding| [ binding.device_id, binding.channel ] }
      .find { |_target, bindings| bindings.many? }
    conflict = duplicate_target || enabled_bindings.find do |binding|
      LogicOutputBinding.joins(:logic_instance)
        .where(device_id: binding.device_id, channel: binding.channel, output_enable: true)
        .where(logic_instances: { output_enable: true })
        .where.not(logic_instance_id: id)
        .exists?
    end
    return unless conflict

    errors.add(:output_enable, "cannot be enabled because a physical output is already controlled by an active instance")
  end

  def clear_diagram_specific_records
    logic_input_bindings.destroy_all
    logic_output_bindings.destroy_all
    traces.destroy_all
  end
end
