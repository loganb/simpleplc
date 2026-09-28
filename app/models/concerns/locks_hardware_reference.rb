module LocksHardwareReference
  extend ActiveSupport::Concern
  included do
    before_save :lock_hardware_reference
  end

  private

  def lock_hardware_reference
    return unless device_id
    self.device = Device.lock.find(device_id)
    # Validation happened before obtaining the lock; the driver may have changed.
    if is_a?(OutputBlock)
      device_supports_binary_output_channel
    elsif acquisition? && source_path.present?
      unless device.supports_input?(source_path)
        errors.add(:source_path, "is not supported by the selected device driver")
      end
    end
    throw :abort if errors.any?
  end
end
