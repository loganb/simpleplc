class Measurement < ApplicationRecord
  MODES = %w[acquisition simulation].freeze

  belongs_to :logic_diagram
  belongs_to :device, optional: true

  has_many :measurement_data, dependent: :destroy
  has_many :data, as: :source, class_name: "Datum", dependent: :destroy

  validates :name, presence: true
  validates :name, uniqueness: { scope: :logic_diagram_id }
  validates :name, format: {
    with: /\A[A-Za-z_]\w*\z/,
    message: "must be an expression-safe identifier"
  }
  validates :mode, inclusion: { in: MODES }
  validates :simulation_value, numericality: true, allow_nil: true

  def simulation?
    mode == "simulation"
  end

  def acquisition?
    mode == "acquisition"
  end

  # Returns the most recently recorded raw acquisition datum, or nil if no data yet.
  def latest_datum
    measurement_data.order(recorded_at: :desc).first
  end

  def latest_trace_datum
    data.order(recorded_at: :desc, id: :desc).first
  end

  def trace_value
    simulation? ? simulation_value : latest_datum&.value
  end
end
