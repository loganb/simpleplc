class Trace < ApplicationRecord
  belongs_to :logic_diagram
  has_many :data, class_name: "Datum", dependent: :destroy

  validates :recorded_at, presence: true

  before_validation :default_recorded_at, on: :create
  after_create :compute!

  def compute!
    Logic::TraceEvaluator.evaluate!(self)
  end

  private

  def default_recorded_at
    self.recorded_at ||= Time.current
  end
end
