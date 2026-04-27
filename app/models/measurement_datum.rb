class MeasurementDatum < ApplicationRecord
  self.table_name = "measurement_data"

  belongs_to :measurement

  validates :recorded_at, presence: true
end
