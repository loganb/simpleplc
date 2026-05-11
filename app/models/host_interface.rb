class HostInterface < ApplicationRecord
  PARITIES = %w[none even odd].freeze

  has_many :devices, dependent: :destroy

  validates :port, presence: true
  validates :baud_rate, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :data_bits, inclusion: { in: 5..8 }
  validates :stop_bits, inclusion: { in: [1, 2] }
  validates :parity, inclusion: { in: PARITIES }

  def modbus_client(&block)
    ModBus::RTUClient.connect(port, baud_rate,
      data_bits: data_bits,
      stop_bits: stop_bits,
      parity: parity.to_sym,
      &block
    )
  end
end
