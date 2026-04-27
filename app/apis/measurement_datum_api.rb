class MeasurementDatumApi < RestfulApi
  def by_query(params)
    scope = MeasurementDatum.where(measurement_id: params[:measurement_id])
    scope = scope.where("recorded_at >= ?", Time.iso8601(params[:since])) if params[:since].present?
    scope = scope.where("recorded_at <= ?", Time.iso8601(params[:until])) if params[:until].present?
    scope.order(recorded_at: :desc).limit(params.fetch(:limit, 100).to_i.clamp(1, 1000))
  end

  def serialize(d)
    {
      id:             d.id,
      measurement_id: d.measurement_id,
      value:          d.value,
      recorded_at:    d.recorded_at.iso8601
    }
  end

  def can_create(_params) = true

  def create_params(params)
    params.require(:measurement_datum).permit(:measurement_id, :value, :recorded_at)
  end
end
