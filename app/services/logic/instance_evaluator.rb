module Logic
  class InstanceEvaluator
    def self.evaluate!(instance, recorded_at: Time.current)
      Trace.create!(logic_instance: instance, recorded_at: recorded_at)
    end
  end
end
