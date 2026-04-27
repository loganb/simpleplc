class Measurement < ApplicationRecord
  belongs_to :device, optional: true

  has_many :measurement_data, dependent: :destroy

  validates :name, presence: true
  validates :update_period, presence: true,
    numericality: { only_integer: true, greater_than: 0 }
  validates :source_type, inclusion: { in: %w[device] }
  validates :device_id, presence: true, if: -> { source_type == "device" }
end
