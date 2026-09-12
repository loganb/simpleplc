# Read-only API over the serial ports discovered on the host.
#
# There is no host_ports table — every request re-scans, because a cached list
# can claim an adapter is plugged in when it isn't. Scanning is a few dozen
# filesystem reads (see HostPortScanner), so this is cheap.
class HostPortApi < RestfulApi
  def by_query(_params) = scan

  # Ids arrive as base64url strings, not integers.
  def canonicalize_ids(ids) = ids.map(&:to_s)

  # Looks ids up against a fresh scan rather than decoding them into paths.
  # An id is a pure function of the port's stable_path, so indexing by id is
  # equivalent to decoding — and it means no client-supplied string is ever
  # turned into a filesystem path. Unknown and malformed ids alike miss the
  # index and become a 404 in the controller.
  def by_ids(ids)
    index = scan.index_by(&:id)
    ids.map { |id| index[id] }
  end

  def serialize(port)
    {
      id:                port.id,
      tty:               port.tty,
      device:            port.device,
      by_id:             port.by_id,
      by_path:           port.by_path,
      stable_path:       port.stable_path,
      identity_basis:    port.identity_basis,
      label:             port.label,
      kernel_driver:     port.kernel_driver,
      usb_vendor_id:     port.usb_vendor_id,
      usb_product_id:    port.usb_product_id,
      usb_manufacturer:  port.usb_manufacturer,
      usb_product:       port.usb_product,
      usb_serial:        port.usb_serial,
      console:           port.console,
      host_interface_id: claimed_by[claim_key(port)]
    }
  end

  private

  def scan
    @scan ||= HostPortScanner.scan
  end

  # Maps device node → id of the HostInterface that opens it. Built by resolving
  # each interface's port, so an interface holding a by-id alias, a by-path
  # alias, or a raw device node all match the port they actually open.
  def claimed_by
    @claimed_by ||= HostInterface.all.each_with_object({}) do |interface, claims|
      device = interface.resolved_device
      claims[device] ||= interface.id if device
    end
  end

  def claim_key(port)
    File.realpath(port.stable_path)
  rescue SystemCallError
    port.device
  end
end
