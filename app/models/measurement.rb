class Measurement < ApplicationRecord
  include ObservesRecordChanges

  has_one :measurement_source, dependent: :destroy
  has_many :measurement_samples, dependent: :delete_all
  has_many :measurement_rollups, dependent: :delete_all

  validates :name, presence: true, uniqueness: true
end
