class Trace < ApplicationRecord
  include ObservesRecordChanges
  RESULT_BUCKETS = {
    "LogicInput" => "logic_inputs",
    "HysteresisLogicBlock" => "logic_blocks",
    "LatchLogicBlock" => "logic_blocks",
    "TimerCounterLogicBlock" => "logic_blocks",
    "ExpressionLogicBlock" => "logic_blocks",
    "LogicBlock" => "logic_blocks",
    "LogicOutput" => "logic_outputs"
  }.freeze

  LEGACY_RESULT_BUCKETS = {
    "LogicInput" => "measurements",
    "LogicOutput" => "output_blocks"
  }.freeze

  belongs_to :logic_instance
  delegate :logic_diagram, to: :logic_instance

  validates :recorded_at, presence: true

  before_validation :default_recorded_at, on: :create
  after_create :compute!

  def compute!
    Logic::TraceEvaluator.evaluate!(self)
  end

  def self.empty_results
    {
      "schema_version" => 2,
      "logic_inputs" => {},
      "logic_blocks" => {},
      "logic_outputs" => {}
    }
  end

  def self.results_bucket_for(source)
    RESULT_BUCKETS.fetch(source.class.name) do
      RESULT_BUCKETS.fetch(source.class.base_class.name)
    end
  end

  def result_for(source)
    bucket = if results.to_h.fetch("schema_version", 1) == 1
      LEGACY_RESULT_BUCKETS.fetch(source.class.base_class.name) { self.class.results_bucket_for(source) }
    else
      self.class.results_bucket_for(source)
    end
    results.to_h.dig(bucket, source.id.to_s)
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
