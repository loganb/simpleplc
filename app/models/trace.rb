class Trace < ApplicationRecord
  include ObservesRecordChanges
  RESULT_BUCKETS = {
    "Measurement" => "measurements",
    "HysteresisLogicBlock" => "logic_blocks",
    "LatchLogicBlock" => "logic_blocks",
    "LogicBlock" => "logic_blocks",
    "OutputBlock" => "output_blocks"
  }.freeze

  belongs_to :logic_diagram

  validates :recorded_at, presence: true

  before_validation :default_recorded_at, on: :create
  after_create :compute!

  def compute!
    Logic::TraceEvaluator.evaluate!(self)
  end

  def self.empty_results
    {
      "schema_version" => 1,
      "measurements" => {},
      "logic_blocks" => {},
      "output_blocks" => {}
    }
  end

  def self.results_bucket_for(source)
    RESULT_BUCKETS.fetch(source.class.name) do
      RESULT_BUCKETS.fetch(source.class.base_class.name)
    end
  end

  def result_for(source)
    results.to_h.dig(self.class.results_bucket_for(source), source.id.to_s)
  end

  def value_for(source)
    result_for(source)&.fetch("value", nil)
  end

  private

  def default_recorded_at
    self.recorded_at ||= Time.current
    self.results = self.class.empty_results if results.blank?
  end
end
