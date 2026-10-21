class MeasurementRollup < ApplicationRecord
  belongs_to :measurement

  BUCKET = 1.minute
end
