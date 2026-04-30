class Datum < ApplicationRecord
  self.table_name = "data"

  belongs_to :trace
  belongs_to :source, polymorphic: true

  validates :recorded_at, presence: true
end
