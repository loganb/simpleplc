module Logic
  class DiagramEvaluator
    def self.evaluate!(diagram, recorded_at: Time.current)
      diagram.logic_blocks.order(:stratum, :id).map do |block|
        BlockEvaluator.evaluate!(block, recorded_at: recorded_at)
      end
    end
  end
end
