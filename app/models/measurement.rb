class Measurement < ApplicationRecord
  belongs_to :device, optional: true

  has_many :measurement_data, dependent: :destroy

  validates :name, presence: true
  validates :update_period, presence: true,
    numericality: { only_integer: true, greater_than: 0 }
  validates :source_type, inclusion: { in: %w[device] }
  validates :device_id, presence: true, if: -> { source_type == "device" }

  # Returns the most recently recorded datum, or nil if no data yet.
  def latest_datum
    measurement_data.order(recorded_at: :desc).first
  end

  # True if a new sample is due based on update_period.
  def due?
    latest = latest_datum
    return true if latest.nil?
    (Time.current - latest.recorded_at) >= update_period
  end

  # Records a new measurement_datum from the source's current value.
  # Returns the new datum, or nil if the source has no fresh sample to record.
  # NULL is recorded if the device errored or the path didn't resolve to a number.
  def take_sample!
    return nil unless source_type == "device"
    return nil unless device&.current_state

    state = device.current_state
    recorded_at = parse_iso8601(state["polled_at"]) || device.last_polled_at
    return nil if recorded_at.nil?

    latest = latest_datum
    return nil if latest && latest.recorded_at >= recorded_at

    value = nil
    if state["status"] == "ok" && state["data"]
      extracted = self.class.extract_path(state["data"], source_path)
      value = extracted if extracted.is_a?(Numeric)
    end

    measurement_data.create!(value: value, recorded_at: recorded_at)
  end

  # Walks `data` according to a path like "temperatures[4]" or "foo.bar[0]".
  # Returns nil if any segment is missing.
  def self.extract_path(data, path)
    return nil if path.blank? || data.nil?
    current = data
    path.scan(/([a-zA-Z_]\w*)|\[(\d+)\]/).each do |key, idx|
      return nil if current.nil?
      current = key ? current[key] : current[idx.to_i]
    end
    current
  end

  private

  def parse_iso8601(str)
    return nil if str.blank?
    Time.iso8601(str)
  rescue ArgumentError
    nil
  end
end
