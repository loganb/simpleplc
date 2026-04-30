module Logic
  class DiagramEvaluator
    def self.evaluate!(diagram, recorded_at: Time.current)
      Trace.create!(logic_diagram: diagram, recorded_at: recorded_at)
    end
  end
end
