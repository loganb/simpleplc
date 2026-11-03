class Measurement < ApplicationRecord
  include ObservesRecordChanges

  SOURCE_CLASSES = { "LogicInput" => LogicInput, "LogicOutput" => LogicOutput }.freeze
  belongs_to :logic_instance, optional: true
  belongs_to :source, polymorphic: true, optional: true
  has_many :measurement_samples, dependent: :delete_all
  has_many :measurement_rollups, dependent: :delete_all

  validates :name, presence: true, uniqueness: true
  before_validation :lock_attachment_sources, if: :attachment_changed?
  validate :valid_attachment

  def self.detach_all(scope)
    scope.order(:id).lock.to_a.each do |measurement|
      measurement.update!(logic_instance_id: nil, source_type: nil, source_id: nil)
    end
  end

  private

  def attachment_changed?
    new_record? || will_save_change_to_logic_instance_id? || will_save_change_to_source_type? || will_save_change_to_source_id?
  end

  def lock_attachment_sources
    return if logic_instance_id.blank?
    LogicInstance.where(id: logic_instance_id).lock.load
    SOURCE_CLASSES[source_type]&.where(id: source_id)&.lock&.load
  end

  def valid_attachment
    fields = [ logic_instance_id, source_type, source_id ]
    return if fields.all?(&:nil?)
    unless fields.all?(&:present?)
      errors.add(:base, "Attachment must include an instance and source")
      return
    end
    klass = SOURCE_CLASSES[source_type]
    unless klass
      errors.add(:source_type, "is not supported")
      return
    end
    port = klass.find_by(id: source_id)
    errors.add(:source_id, "does not exist") unless port
    instance = LogicInstance.find_by(id: logic_instance_id)
    if port && (!instance || port.logic_diagram_id != instance.logic_diagram_id)
      errors.add(:source_id, "must belong to the instance's diagram")
    end
  end
end
