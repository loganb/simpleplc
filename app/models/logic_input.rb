class LogicInput < ApplicationRecord
  include ObservesRecordChanges

  VALUE_TYPES = %w[boolean number].freeze

  belongs_to :logic_diagram
  has_many :logic_input_bindings, dependent: :destroy

  validates :name, presence: true
  validates :name, uniqueness: { scope: :logic_diagram_id }
  validates :name, format: {
    with: /\A[A-Za-z_]\w*\z/,
    message: "must be an expression-safe identifier"
  }
  validates :value_type, inclusion: { in: VALUE_TYPES }
end
