class HostInterface < ApplicationRecord
  include ObservesRecordChanges
  include PersistsObservations
  include HardwareRevision
  CONFIGURATION_FIELDS = %w[name port baud_rate data_bits stop_bits parity enabled].freeze
  before_validation :identify_port, if: -> { new_record? || will_save_change_to_port? }
  validates :port_identity, uniqueness: true, allow_nil: true

  def scan_active? = %w[requested scanning].include?(scan_state)

  def identify_port
    found = HostPortScanner.scan.find do |p|
      begin
        File.realpath(p.stable_path) == File.realpath(port)
      rescue SystemCallError
        false
      end
    end if port_present?
    self.port = found.stable_path if found
    self.port_identity = port_present? ? SerialBusLock.identity(port) : nil
  end
  PARITIES = %w[none even odd].freeze

  # How long the poller's report is believed. Must stay comfortably above
  # Poller::POLL_INTERVAL so a healthy bus never reads as stale between cycles;
  # a spec asserts the relationship rather than trusting this comment.
  STALE_AFTER = 35.seconds

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

  # The single state the UI renders, folding operator intent (`enabled`) together
  # with the poller's report (`online`) and how recently that report arrived.
  #
  #   "online"    — the poller is holding the port open right now
  #   "offline"   — the poller is reporting and is not holding the port
  #   "releasing" — the operator turned the bus off and the poller still has the
  #                 port; it will let go within a cycle
  #   "disabled"  — the operator turned the bus off and the port is free
  #   "unknown"   — nobody is reporting; the poller is down, wedged, or has never
  #                 run since this bus was configured
  #
  # "releasing" exists because disabling is a request, not an act: the web
  # process never touches the serial port. Anything waiting for the bus — an
  # operator with minicom, or eventually a device scan — needs to know the
  # difference between "asked for" and "handed over".
  #
  # Staleness gates both directions, not just `online`: a poller that dies
  # holding a port would otherwise leave `online` true forever, and a bus that
  # no poller has ever seen is not the same thing as one a poller decided not
  # to open.
  def connection_state
    reporting = poller_reported_at.present? && poller_reported_at >= STALE_AFTER.ago

    unless enabled
      # A poller that stopped reporting is a poller that no longer holds
      # anything: the kernel closed its ports when the process died.
      return online && reporting ? "releasing" : "disabled"
    end

    return "unknown" unless reporting

    online ? "online" : "offline"
  end

  # Reports run through normal validations, callbacks, timestamps and locking.
  # Concurrent edits are preserved by retrying only the observation fields.
  def report_connection(online:, error: nil)
    persist_observation({ online: online, connection_error: error, poller_reported_at: Time.current })
  end

  # With a block, opens a client, yields it, and closes it (rmodbus's own
  # contract). Without one, returns a client the caller is responsible for
  # closing — which is what the poller does, since it holds ports open across
  # cycles. See claude/interface-online-state.md.
  def modbus_client(&block)
    ModBus::RTUClient.connect(port, baud_rate,
      data_bits: data_bits,
      stop_bits: stop_bits,
      parity: parity.to_sym,
      &block
    )
  end
end
