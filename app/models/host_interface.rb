class HostInterface < ApplicationRecord
  PARITIES = %w[none even odd].freeze

  has_many :devices, dependent: :destroy

  validates :name, presence: true
  validates :port, presence: true
  validates :baud_rate, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :data_bits, inclusion: { in: 5..8 }
  validates :stop_bits, inclusion: { in: [ 1, 2 ] }
  validates :parity, inclusion: { in: PARITIES }

  # Whether this interface's port currently exists on the host. A configured
  # interface whose adapter has been unplugged (or whose stable alias no longer
  # resolves because the adapter was replaced) reports false, which is how the
  # UI surfaces a missing bus without opening anything.
  #
  # Deliberately not named #present? — that is Object#present?, and redefining it
  # would make this record answer "am I blank?" with "is my adapter plugged in?".
  def port_present?
    resolved_device.present?
  end

  # The device node this interface's port resolves to, e.g. "/dev/ttyUSB0".
  # nil when the port does not exist.
  def resolved_device
    File.realpath(port)
  rescue SystemCallError, TypeError
    nil
  end

  def modbus_client(&block)
    ModBus::RTUClient.connect(port, baud_rate,
      data_bits: data_bits,
      stop_bits: stop_bits,
      parity: parity.to_sym,
      &block
    )
  end
end
