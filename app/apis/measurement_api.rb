class MeasurementApi < RestfulApi
  SOURCE_KEYS = %i[logic_instance_id logic_input_id logic_output_id].freeze

  def by_query(params)
    scope = Measurement.includes(:measurement_source).order(:name, :id)
    if params[:logic_instance_id].present?
      scope = scope.joins(:measurement_source).where(measurement_sources: { logic_instance_id: params[:logic_instance_id] })
    end
    scope
  end

  def serialize(measurement)
    source = measurement.measurement_source
    {
      id: measurement.id,
      name: measurement.name,
      units: measurement.units,
      logic_instance_id: source&.logic_instance_id,
      logic_input_id: source&.logic_input_id,
      logic_output_id: source&.logic_output_id,
      created_at: measurement.created_at.iso8601,
      updated_at: measurement.updated_at.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true
  def can_destroy(_object) = true

  def create_params(params)
    params.require(:measurement).permit(:name, :units, *SOURCE_KEYS)
  end

  def create(params)
    Measurement.transaction do
      attrs = params.to_h.symbolize_keys
      measurement = Measurement.create!(attrs.except(*SOURCE_KEYS))
      save_source!(measurement, attrs) if (attrs.keys & SOURCE_KEYS).any?
      measurement
    end
  end

  def update(measurement, params)
    attrs = params.to_h.symbolize_keys
    # Sample inserts check the Measurement FK while holding the source row.
    # A NO KEY UPDATE lock permits that check, avoiding a source-edit deadlock.
    measurement.with_lock("FOR NO KEY UPDATE") do
      measurement.update!(attrs.except(*SOURCE_KEYS))
      if (attrs.keys & SOURCE_KEYS).any?
        save_source!(measurement, attrs)
        measurement.touch
      end
    end
  end

  def invalidates(_object)
    { Measurement => :all }
  end

  private

  def save_source!(measurement, attrs)
    source_attrs = attrs.slice(*SOURCE_KEYS)
    if source_attrs.values.all?(&:blank?)
      measurement.measurement_source&.destroy!
      measurement.reset_measurement_source
      return
    end

    source = measurement.measurement_source || measurement.build_measurement_source
    source.assign_attributes(source_attrs)
    source.save!
  end
end
