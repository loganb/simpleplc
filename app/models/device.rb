class Device < ApplicationRecord
  include ObservesRecordChanges
  include PersistsObservations
  include HardwareRevision
  CONFIGURATION_FIELDS = %w[name host_interface_id modbus_address driver io_labels].freeze
  BUS_CONFIGURATION_FIELDS = %w[name host_interface_id modbus_address driver].freeze
  MAX_IO_LABEL_LENGTH = 100
  attr_accessor :reconciling
  validates :driver, inclusion: { in: ->(_) { Drivers::Registry.all.map(&:name) } }
  has_many :measurements, dependent: :restrict_with_error
  has_many :output_blocks, dependent: :restrict_with_error
  after_save :bump_bus_revision
  after_destroy :bump_bus_revision
  before_validation :normalize_io_labels

  def bump_bus_revision
    return if destroyed_by_association
    return unless destroyed? || (saved_changes.keys & BUS_CONFIGURATION_FIELDS).any?
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

  def inputs
    driver_class.inputs.map do |input|
      input.merge(label: label_overrides("inputs")[input[:path]] || input[:label])
    end
  end

  def outputs
    driver_class.outputs.map do |output|
      output.merge(label: label_overrides("outputs")[output[:channel].to_s] || output[:label])
    end
  end

  def supports_input?(path)
    inputs.any? { |input| input[:path] == path }
  end

  def supports_binary_output?(channel)
    outputs.any? { |output| output[:channel] == channel && output[:value_type] == "boolean" }
  end

  private

  def normalize_io_labels
    raw = io_labels
    unless raw.is_a?(Hash)
      errors.add(:io_labels, "must be an object")
      return
    end

    sections = raw.stringify_keys
    %w[inputs outputs].each do |section|
      next if sections[section].nil? || sections[section].is_a?(Hash)
      errors.add(:io_labels, "#{section} must be an object")
    end
    return if errors[:io_labels].any?

    entries = %w[inputs outputs].to_h do |section|
      values = sections.fetch(section, {}).to_h
      normalized = {}
      values.each do |key, value|
        unless value.is_a?(String)
          errors.add(:io_labels, "values must be strings")
          next
        end
        label = value.strip
        if label.length > MAX_IO_LABEL_LENGTH
          errors.add(:io_labels, "labels must be at most #{MAX_IO_LABEL_LENGTH} characters")
          next
        end
        normalized[key.to_s] = label if label.present?
      end
      [ section, normalized ]
    end
    return if errors[:io_labels].any?

    catalog = Drivers::Registry.find(driver)
    unless catalog
      self.io_labels = {}
      return
    end

    allowed = {
      "inputs" => catalog.inputs.map { |input| input[:path] },
      "outputs" => catalog.outputs.map { |output| output[:channel].to_s }
    }
    self.io_labels = entries.each_with_object({}) do |(section, values), result|
      kept = values.slice(*allowed.fetch(section))
      result[section] = kept if kept.any?
    end
  end

  def label_overrides(section)
    io_labels.is_a?(Hash) && io_labels[section].is_a?(Hash) ? io_labels[section] : {}
  end

  def driver_class
    Drivers::Registry.fetch(driver)
  end
end
