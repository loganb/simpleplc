class MeasurementSample < ApplicationRecord
  belongs_to :measurement

  validates :recorded_at, presence: true
end
