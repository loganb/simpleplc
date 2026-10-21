class LogicDiagram < ApplicationRecord
  include ObservesRecordChanges
  # Evaluation order: blocks by stratum, then everything by id.
  has_many :logic_blocks, -> { order(:stratum, :id) }, dependent: :destroy
  has_many :logic_inputs, -> { order(:id) }, dependent: :destroy
  has_many :logic_outputs, -> { order(:id) }, dependent: :destroy
  has_many :logic_instances, dependent: :destroy

  validates :name, presence: true
end
