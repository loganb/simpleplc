class LogicInstance < ApplicationRecord
  include ObservesRecordChanges

  belongs_to :logic_diagram
  has_many :logic_input_bindings, dependent: :destroy
  has_many :logic_output_bindings, dependent: :destroy
  has_many :traces, dependent: :delete_all
  has_many :trace_rollups, dependent: :delete_all
  has_one :logic_instance_state, dependent: :delete

  validates :name, presence: true, uniqueness: true
  validates :update_period, presence: true,
    numericality: { only_integer: true, greater_than: 0 }
  validate :physical_outputs_have_one_active_owner, if: :output_enable?

  before_validation :lock_output_devices, if: :output_enable?
  before_update :clear_diagram_specific_records, if: :will_save_change_to_logic_diagram_id?

  # Latest evaluated result for a source, from the live state row.
  def result_for(source)
    logic_instance_state&.result_for(source)
  end

  def update_interval
    update_period.seconds
  end

  # When the instance is next due by its last evaluation; nil if never run.
  def next_due_at
    recorded_at = logic_instance_state&.recorded_at
    recorded_at + update_interval if recorded_at
  end

  # Row-locks the live state (created on first evaluation) and keeps it on the
  # association, so the evaluators read the previous results from it.
  def lock_state!
    unless logic_instance_state
      LogicInstanceState.create_or_find_by!(logic_instance: self) { |state| state.recorded_at = Time.at(0).utc }
      reset_logic_instance_state
    end
    logic_instance_state.lock!
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
    traces.delete_all
    trace_rollups.delete_all
    logic_instance_state&.delete
    reset_logic_instance_state
  end
end
