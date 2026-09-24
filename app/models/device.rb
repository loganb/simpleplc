class Device < ApplicationRecord
  include ObservesRecordChanges
  include PersistsObservations
  belongs_to :host_interface

  validates :modbus_address, presence: true,
    numericality: { only_integer: true, in: 1..247 }
  validates :driver, presence: true
  validates :modbus_address, uniqueness: { scope: :host_interface_id }

  # Returns an instantiated driver for this device.
  # The driver is given a connected Modbus slave to communicate through.
  def driver_instance(slave)
    driver.constantize.new(self, slave)
  end
end
