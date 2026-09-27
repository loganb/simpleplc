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
      metadata = Drivers::Registry.metadata.find { |d| d[:id] == device.driver }
      match = /\A(\w+)\[(\d+)\]\z/.match(source_path)
      unless metadata && match && metadata[:fields].include?(match[1]) && match[2].to_i < metadata[:channel_count]
        errors.add(:source_path, "is not supported by the selected device driver")
      end
    end
    throw :abort if errors.any?
  end
end
