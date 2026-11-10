require "digest"

module MeasurementHistoryPointId
  SEPARATOR = "🔹".freeze
  MAX_SAFE = 9_007_199_254_740_991
  FIELDS = %w[logic_instance_id logic_diagram_id source_type source_id value_type logic_instance_name logic_diagram_name source_name].freeze

  def self.digest(source)
    Digest::SHA256.hexdigest(JSON.generate(FIELDS.map { |key| source[key] }))
  end

  def self.encode(payload)
    payload.join(SEPARATOR)
  end

  def self.decode(id)
    return unless id.is_a?(String)
    tokens = id.split(SEPARATOR, -1)
    positive = /\A[1-9][0-9]*\z/
    signed = /\A(?:0|[1-9][0-9]*|-[1-9][0-9]*)\z/
    case tokens
    in [ "s", measurement_id, sample_id ]
      return unless positive.match?(measurement_id) && positive.match?(sample_id)
      data = [ "s", measurement_id.to_i, sample_id.to_i ]
    in [ "b", measurement_id, start_us, end_us, digest ]
      return unless positive.match?(measurement_id) && signed.match?(start_us) && signed.match?(end_us) && digest.match?(/\A[0-9a-f]{64}\z/)
      start_value, end_value = start_us.to_i, end_us.to_i
      return unless start_value.abs <= MAX_SAFE && end_value.abs <= MAX_SAFE && start_value < end_value
      data = [ "b", measurement_id.to_i, start_value, end_value, digest ]
    else
      return
    end
    data if encode(data) == id
  end
end
