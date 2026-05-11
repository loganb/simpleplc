module Logic
  class TraceEvaluator
    def self.evaluate!(trace)
      new(trace).evaluate!
    end

    def initialize(trace)
      @trace = trace
      @diagram = trace.logic_diagram
    end

    def evaluate!
      ActiveRecord::Base.transaction do
        @results = Trace.empty_results
        snapshot_measurements!
        evaluate_blocks!
        evaluate_outputs!
        trace.update!(results: results)
      end
      trace
    end

    private

    attr_reader :trace, :diagram, :results

    def snapshot_measurements!
      diagram.measurements.order(:id).each do |measurement|
        results["measurements"][measurement.id.to_s] = result_payload(
          measurement,
          value: measurement.trace_value,
          state: { "mode" => measurement.mode },
          input_values: {}
        )
      end
    end

    def evaluate_blocks!
      context = EvaluationContext.new(trace: trace, results: results)
      diagram.logic_blocks.order(:stratum, :id).each do |block|
        results["logic_blocks"][block.id.to_s] = BlockEvaluator.evaluate!(block, trace: trace, context: context)
      end
    end

    def evaluate_outputs!
      context = EvaluationContext.new(trace: trace, results: results)
      diagram.output_blocks.order(:id).each do |output|
        results["output_blocks"][output.id.to_s] = OutputEvaluator.evaluate!(output, trace: trace, context: context)
      end
    end

    def result_payload(source, value:, state:, input_values:)
      {
        "id" => source.id,
        "name" => source.name,
        "value" => value,
        "state" => state,
        "input_values" => input_values,
        "recorded_at" => trace.recorded_at.iso8601
      }
    end
  end
end
