class LogicDiagram < ApplicationRecord
  include ObservesRecordChanges
  has_many :logic_blocks, dependent: :destroy
  has_many :measurements, dependent: :destroy
  has_many :output_blocks, dependent: :destroy
  has_many :traces, dependent: :destroy

  validates :name, presence: true
  validates :update_period, presence: true,
    numericality: { only_integer: true, greater_than: 0 }

  def latest_trace
    traces.order(recorded_at: :desc, id: :desc).first
  end
end
