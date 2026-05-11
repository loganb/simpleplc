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
        snapshot_measurements!
        evaluate_blocks!
        evaluate_outputs!
      end
      trace
    end

    private

    attr_reader :trace, :diagram

    def snapshot_measurements!
      diagram.measurements.order(:id).each do |measurement|
        measurement.data.create!(
          trace: trace,
          value: measurement.trace_value,
          state: { "mode" => measurement.mode },
          input_values: {},
          recorded_at: trace.recorded_at
        )
      end
    end

    def evaluate_blocks!
      context = EvaluationContext.new(trace: trace)
      diagram.logic_blocks.order(:stratum, :id).each do |block|
        BlockEvaluator.evaluate!(block, trace: trace, context: context)
      end
    end

    def evaluate_outputs!
      context = EvaluationContext.new(trace: trace)
      diagram.output_blocks.order(:id).each do |output|
        OutputEvaluator.evaluate!(output, trace: trace, context: context)
      end
    end
  end
end
