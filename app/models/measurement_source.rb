class MeasurementSource < ApplicationRecord
  belongs_to :measurement
  belongs_to :logic_instance
  belongs_to :logic_input, optional: true
  belongs_to :logic_output, optional: true

  validates :measurement_id, uniqueness: true
  validate :exactly_one_port
  validate :port_belongs_to_instance_diagram

  def result_bucket
    logic_input_id ? "logic_inputs" : "logic_outputs"
  end

  def port_id
    logic_input_id || logic_output_id
  end

  private

  def exactly_one_port
    return if logic_input_id.present? ^ logic_output_id.present?

    errors.add(:base, "select exactly one input or output")
  end

  def port_belongs_to_instance_diagram
    return unless logic_instance
    port = logic_input || logic_output
    return unless port
    return if port.logic_diagram_id == logic_instance.logic_diagram_id

    errors.add(:base, "port must belong to the instance's diagram")
  end
end
