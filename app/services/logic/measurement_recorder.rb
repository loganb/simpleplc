module Logic
  class MeasurementRecorder
    def self.record!(trace)
      sources = MeasurementSource.where(logic_instance_id: trace.logic_instance_id).order(:id).lock.to_a
      return if sources.empty?

      rows = sources.map do |source|
        {
          measurement_id: source.measurement_id,
          recorded_at: trace.recorded_at,
          value: trace.results.dig(source.result_bucket, source.port_id.to_s, "value")
        }
      end
      MeasurementSample.insert_all!(rows)
    end
  end
end
