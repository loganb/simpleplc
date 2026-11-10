class MeasurementHistoryPoint
  attr_reader :attributes

  def initialize(attributes)
    @attributes = attributes
  end

  def id = attributes.fetch(:id)
  def measurement_id = attributes.fetch(:measurement_id)
end
