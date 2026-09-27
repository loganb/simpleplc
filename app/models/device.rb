class Device < ApplicationRecord
  include ObservesRecordChanges
  include PersistsObservations
  include HardwareRevision
  CONFIGURATION_FIELDS = %w[name host_interface_id modbus_address driver].freeze
  attr_accessor :reconciling
  validates :driver, inclusion: { in: ->(_) { Drivers::Registry.all.map(&:name) } }
  has_many :measurements, dependent: :restrict_with_error
  has_many :output_blocks, dependent: :restrict_with_error
  after_save :bump_bus_revision
  after_destroy :bump_bus_revision

  def bump_bus_revision
    return if destroyed_by_association
    return unless destroyed? || @configuration_changed
    [ host_interface_id, host_interface_id_before_last_save ].compact.uniq.sort.each do |id|
      bus = HostInterface.find_by(id: id)
      next unless bus
      bus.with_lock { bus.update!(configuration_revision: bus.configuration_revision + 1) }
    end
  end
  belongs_to :host_interface

  validates :modbus_address, presence: true,
    numericality: { only_integer: true, in: 1..247 }
  validates :driver, presence: true
  validates :modbus_address, uniqueness: { scope: :host_interface_id }, unless: :reconciling

  # Returns an instantiated driver for this device.
  # The driver is given a connected Modbus slave to communicate through.
  def driver_instance(slave)
    Drivers::Registry.fetch(driver).new(self, slave)
  end
end
