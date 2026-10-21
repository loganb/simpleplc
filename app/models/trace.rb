class Trace < ApplicationRecord
  include ObservesRecordChanges
  include HasResults

  belongs_to :logic_instance
  delegate :logic_diagram, to: :logic_instance

  validates :recorded_at, presence: true

  before_validation :default_recorded_at, on: :create
  # Results are computed before the single INSERT. This also locks and updates
  # the instance's state row inside the create transaction.
  before_create :compute!
  after_create :record_measurements!

  def compute!
    Logic::TraceEvaluator.evaluate!(self)
  end

  def record_measurements!
    Logic::MeasurementRecorder.record!(self)
  end

  private

  def default_recorded_at
    self.recorded_at ||= Time.current
    self.results = self.class.empty_results if results.blank?
  end
end
