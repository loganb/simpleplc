require "base64"
require "digest"

module MeasurementHistoryPointId
  PREFIX = "mhp1_".freeze
  MAX_SAFE = 9_007_199_254_740_991
  FIELDS = %w[logic_instance_id logic_diagram_id source_type source_id value_type logic_instance_name logic_diagram_name source_name].freeze

  def self.digest(source)
    Digest::SHA256.hexdigest(JSON.generate(FIELDS.map { |key| source[key] }))
  end

  def self.encode(payload)
    PREFIX + Base64.urlsafe_encode64(JSON.generate(payload), padding: false)
  end

  def self.decode(id)
    return unless id.is_a?(String) && id.match?(/\Amhp1_[A-Za-z0-9_-]+\z/)
    data = JSON.parse(Base64.urlsafe_decode64(id.delete_prefix(PREFIX)))
    return unless data.is_a?(Array) && encode(data) == id
    positive = ->(v) { v.is_a?(Integer) && v.positive? }
    safe = ->(v) { v.is_a?(Integer) && v.abs <= MAX_SAFE }
    case data
    in [ "s", measurement_id, sample_id ]
      data if positive.call(measurement_id) && positive.call(sample_id)
    in [ "b", measurement_id, start_us, end_us, digest ]
      data if positive.call(measurement_id) && safe.call(start_us) && safe.call(end_us) && start_us < end_us && digest.is_a?(String) && digest.match?(/\A[0-9a-f]{64}\z/)
    else
      nil
    end
  rescue ArgumentError, JSON::ParserError
    nil
  end
end
