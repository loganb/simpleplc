class LogicDiagram < ApplicationRecord
  include ObservesRecordChanges
  has_many :logic_blocks, dependent: :destroy
  has_many :logic_inputs, dependent: :destroy
  has_many :logic_outputs, dependent: :destroy
  has_many :logic_instances, dependent: :destroy

  validates :name, presence: true
end
