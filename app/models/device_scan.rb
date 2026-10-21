# One sweep of a bus's address range for responding devices. The poller runs it
# (HardwareScan); the client only creates it and may cancel it. Results are an
# array, one entry per responding address. Starting a scan deletes the bus's
# older ones, so the UI shows the latest and there is no history.
class DeviceScan < ApplicationRecord
  include ObservesRecordChanges

  STATES = %w[pending running done failed cancelled].freeze
  ACTIVE_STATES = %w[pending running].freeze
  ADDRESSES = (1..247).freeze

  belongs_to :host_interface

  attribute :first_address, :integer, default: ADDRESSES.begin
  attribute :last_address, :integer, default: ADDRESSES.end

  validates :state, inclusion: { in: STATES }
  validates :first_address, :last_address, numericality: { only_integer: true, in: ADDRESSES }
  validate :range_ordered
  validate :bus_disabled, on: :create
  validate :one_active_scan, on: :create
  before_validation :compute_total, on: :create
  before_create :replace_older_scans

  scope :active, -> { where(state: ACTIVE_STATES) }

  def active? = ACTIVE_STATES.include?(state)
  def cancelled? = state == "cancelled"

  private

  def compute_total
    self.total = last_address - first_address + 1 if first_address.is_a?(Integer) && last_address.is_a?(Integer)
  end

  def range_ordered
    errors.add(:last_address, "must not be before the first address") if first_address && last_address && last_address < first_address
  end

  def bus_disabled
    errors.add(:base, "Disable the bus before scanning") if host_interface&.enabled?
  end

  def one_active_scan
    errors.add(:base, "A scan is already pending or running") if host_interface && host_interface.device_scans.active.exists?
  end

  def replace_older_scans
    DeviceScan.where(host_interface_id: host_interface_id).delete_all
  end
end
