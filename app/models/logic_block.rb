class LogicBlock < ApplicationRecord
  include ObservesRecordChanges

  def self.api_class_name
    "LogicBlock"
  end

  belongs_to :logic_diagram

  validates :name, presence: true
  validates :name, uniqueness: { scope: :logic_diagram_id }
  validates :name, format: {
    with: /\A[A-Za-z_]\w*\z/,
    message: "must be an expression-safe identifier"
  }
  validates :type, presence: true
  validates :stratum, numericality: { only_integer: true, greater_than_or_equal_to: 1 }
  validate :input_expressions_are_valid
  validate :required_inputs_are_present
  validate :referenced_logic_blocks_are_upstream

  def required_input_names
    []
  end

  def evaluate_logic(_input_values, _previous_state, **)
    raise NotImplementedError, "#{self.class} must implement #evaluate_logic"
  end

  # How a result is stored in the trace `value`. Booleans become 1.0/0.0 unless
  # the block type opts to keep them.
  def trace_value(value)
    return nil if value.nil?
    return value.to_f if value.is_a?(Numeric)

    value ? 1.0 : 0.0
  end

  def numeric(value)
    return 1.0 if value == true
    return 0.0 if value == false

    value.to_f
  end

  def truthy?(value)
    return nil if value.nil?

    value != false && value != 0
  end

  private

  def required_inputs_are_present
    return unless input_expressions.is_a?(Hash)

    missing = required_input_names - input_expressions.keys
    missing.each do |input_name|
      errors.add(:input_expressions, "missing #{input_name}")
    end
  end

  def input_expressions_are_valid
    @parsed_references = {}
    return errors.add(:input_expressions, "must be a JSON object") unless input_expressions.is_a?(Hash)
    input_expressions.each do |input_name, expression|
      errors.add(:input_expressions, "#{input_name} must be present") if expression.blank?
      @parsed_references[input_name] = Logic::Expression.references(expression.to_s)[:identifiers]
    rescue Logic::Expression::Error => e
      errors.add(:input_expressions, "#{input_name}: #{e.message}")
    end
  end

  def referenced_logic_blocks_are_upstream
    return unless input_expressions.is_a?(Hash) && @parsed_references

    all_names = @parsed_references.values.flatten.uniq
    return if all_names.empty?

    blocks_by_name = logic_diagram ? logic_diagram.logic_blocks.where(name: all_names).index_by(&:name) : {}
    inputs_by_name = logic_diagram ? logic_diagram.logic_inputs.where(name: all_names).index_by(&:name) : {}

    all_names.each do |name|
      referenced_block = blocks_by_name[name]
      referenced_input = inputs_by_name[name]

      if referenced_block && referenced_input
        errors.add(:input_expressions, "reference #{name} is ambiguous")
      elsif referenced_block
        validate_referenced_logic_block(referenced_block, name)
      elsif referenced_input.nil?
        errors.add(:input_expressions, "references unknown name #{name}")
      end
    end
  end

  def validate_referenced_logic_block(referenced, label)
    if referenced.id == id
      errors.add(:input_expressions, "cannot reference itself")
    elsif referenced.logic_diagram_id != logic_diagram_id
      errors.add(:input_expressions, "references #{label} from another diagram")
    elsif referenced.stratum >= stratum
      errors.add(:input_expressions, "references #{label} that is not upstream")
    end
  end
end
