# A bounded, read-only projection of independently stored Measurement history.
MeasurementSeries = Data.define(:id, :measurement_id, :since, :until_time, :points)
