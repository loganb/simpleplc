# A `results` jsonb column holding one evaluation's per-source results, keyed
# by bucket and source id. Shared by Trace and LogicInstanceState.
module HasResults
  extend ActiveSupport::Concern

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

  class_methods do
    def empty_results
      {
        "schema_version" => 2,
        "logic_inputs" => {},
        "logic_blocks" => {},
        "logic_outputs" => {}
      }
    end

    def results_bucket_for(source)
      RESULT_BUCKETS.fetch(source.class.name) do
        RESULT_BUCKETS.fetch(source.class.base_class.name)
      end
    end
  end

  # Looks a source up in results of either schema version.
  def result_for(source)
    hash = results.to_h
    bucket = if hash.fetch("schema_version", 1) == 1
      LEGACY_RESULT_BUCKETS.fetch(source.class.base_class.name) { self.class.results_bucket_for(source) }
    else
      self.class.results_bucket_for(source)
    end
    hash.dig(bucket, source.id.to_s)
  end

  def value_for(source)
    result_for(source)&.fetch("value", nil)
  end
end
