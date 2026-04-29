class LogicDiagram < ApplicationRecord
  has_many :logic_blocks, dependent: :destroy

  validates :name, presence: true
end
