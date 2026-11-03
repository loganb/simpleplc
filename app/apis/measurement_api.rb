class MeasurementApi < RestfulApi
  def by_query(_params)
    Measurement.order(:name, :id)
  end

  # Called before serialization for both queries and individual mutations.
  def expound(objects)
    ids = objects.map(&:id).compact
    @samples = previews(MeasurementSample, ids, :recorded_at)
    @rollups = previews(MeasurementRollup, ids - @samples.keys, :bucket_start)
    @instances = LogicInstance.includes(:logic_diagram).where(id: objects.map(&:logic_instance_id).compact).index_by(&:id)
    @sources = {}
    Measurement::SOURCE_CLASSES.each do |type, klass|
      klass.where(id: objects.select { |m| m.source_type == type }.map(&:source_id)).each { |source| @sources[[ type, source.id ]] = source }
    end
    []
  end

  def serialize(measurement)
    instance = (@instances || {})[measurement.logic_instance_id]
    port = (@sources || {})[[ measurement.source_type, measurement.source_id ]]
    samples = (@samples || {}).fetch(measurement.id, [])
    rollups = (@rollups || {}).fetch(measurement.id, [])
    kind = samples.any? ? "samples" : (rollups.any? ? "rollups" : nil)
    api = kind == "samples" ? MeasurementSampleApi.new(controller) : MeasurementRollupApi.new(controller)
    {
      id: measurement.id, name: measurement.name, logic_instance_id: measurement.logic_instance_id,
      source_type: measurement.source_type, source_id: measurement.source_id,
      source: port && instance && { id: port.id, name: port.name, value_type: port.value_type,
        logic_diagram_id: instance.logic_diagram_id, logic_diagram_name: instance.logic_diagram.name,
        logic_instance_name: instance.name },
      preview_kind: kind, preview: (kind == "samples" ? samples : rollups).map { |row| api.serialize(row) },
      created_at: measurement.created_at&.iso8601, updated_at: measurement.updated_at&.iso8601
    }
  end

  def can_create(_params) = true
  def can_update(_object, _params) = true

  def create_params(params)
    params.require(:measurement).permit(:name)
  end

  def update_params(params)
    params.require(:measurement).permit(:name, :logic_instance_id, :source_type, :source_id)
  end

  def update(object, params)
    tuple = %w[logic_instance_id source_type source_id]
    if (tuple & params.keys).any? && !(tuple - params.keys).empty?
      object.errors.add(:base, "Attachment must include all three fields")
      raise ActiveRecord::RecordInvalid, object
    end
    Measurement.transaction do
      if params[:logic_instance_id].present?
        LogicInstance.where(id: params[:logic_instance_id]).lock.load
        klass = Measurement::SOURCE_CLASSES[params[:source_type]]
        klass&.where(id: params[:source_id])&.lock&.load
      end
      object.lock!
      object.update!(params)
    end
  end

  def invalidates(_object)
    { Measurement => :queries, LogicInstance => :records }
  end

  private

  def previews(klass, ids, time_column)
    return {} if ids.empty?
    # Each indexed lateral lookup stops after five rows instead of ranking every
    # retained sample for every measurement on the page.
    table = klass.table_name
    id_list = ids.map { |id| Integer(id) }.join(",")
    sql = <<~SQL
      SELECT latest.* FROM unnest(ARRAY[#{id_list}]::bigint[]) AS wanted(id)
      CROSS JOIN LATERAL (
        SELECT * FROM #{table} WHERE measurement_id = wanted.id
        ORDER BY #{time_column} DESC, id DESC LIMIT 5
      ) AS latest
    SQL
    klass.find_by_sql(sql).group_by(&:measurement_id)
  end
end
