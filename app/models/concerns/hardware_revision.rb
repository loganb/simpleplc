module HardwareRevision
  extend ActiveSupport::Concern
  included do
    before_save :advance_configuration_revision
  end

  private

  def advance_configuration_revision
    @configuration_changed = new_record? || self.class::CONFIGURATION_FIELDS.any? { |key| will_save_change_to_attribute?(key) }
    self.configuration_revision += 1 if @configuration_changed && persisted?
  end
end
