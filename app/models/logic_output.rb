class LogicOutput < ApplicationRecord
  include ObservesRecordChanges

  VALUE_TYPES = LogicInput::VALUE_TYPES

  belongs_to :logic_diagram
  has_many :logic_output_bindings, dependent: :destroy

  validates :name, presence: true
  validates :name, uniqueness: { scope: :logic_diagram_id }
  validates :name, format: {
    with: /\A[A-Za-z_]\w*\z/,
    message: "must be an expression-safe identifier"
  }
  validates :value_type, inclusion: { in: VALUE_TYPES }
  validates :input_expression, presence: true
  validate :input_expression_is_valid
  validate :referenced_names_exist

  private

  def input_expression_is_valid
    @parsed_references = []
    return if input_expression.blank?

    @parsed_references = Logic::Expression.references(input_expression.to_s)[:identifiers]
  rescue Logic::Expression::Error => e
    errors.add(:input_expression, e.message)
  end

  def referenced_names_exist
    return unless logic_diagram && @parsed_references

    blocks_by_name = logic_diagram.logic_blocks.where(name: @parsed_references).index_by(&:name)
    inputs_by_name = logic_diagram.logic_inputs.where(name: @parsed_references).index_by(&:name)

    @parsed_references.each do |name|
      referenced_block = blocks_by_name[name]
      referenced_input = inputs_by_name[name]

      if referenced_block && referenced_input
        errors.add(:input_expression, "reference #{name} is ambiguous")
      elsif referenced_block.nil? && referenced_input.nil?
        errors.add(:input_expression, "references unknown name #{name}")
      end
    end
  end
end
