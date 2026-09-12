require "base64"

# A serial port discovered on the host, as reported by HostPortScanner.
#
# This is a plain value object, not an ActiveRecord model — discovered ports are
# a property of the machine, not rows we own. It is exposed read-only through
# HostPortApi so the frontend can list candidate ports and turn one into a
# HostInterface.
#
# Identity
# --------
# #id is the base64url encoding of #stable_path. The sysfs tty name (ttyUSB0) is
# deliberately *not* the identity: it is assigned in USB enumeration order and
# can shift between the adapter that was scanned and the one later fetched.
# stable_path is bound to the adapter (or at worst the USB socket), so an id
# means the same physical port across reboots and replugs.
#
# The base64url alphabet is [A-Za-z0-9_-], so an id never contains a character
# that URL routing or format parsing wants to interpret — see
# claude/host-port-scan.md.
HostPort = Data.define(
  :tty,             # sysfs name, e.g. "ttyUSB0" — display/logs only, never an identifier
  :device,          # raw device node, e.g. "/dev/ttyUSB0"
  :by_id,           # /dev/serial/by-id alias, or nil
  :by_path,         # /dev/serial/by-path alias, or nil
  :label,           # human-readable description
  :kernel_driver,   # bound driver, e.g. "ftdi_sio"
  :usb_vendor_id,
  :usb_product_id,
  :usb_manufacturer,
  :usb_product,
  :usb_serial,
  :console          # true when the kernel uses this tty as a console
) do
  # The most stable path available for reaching this port, preferring identity
  # that follows the adapter over identity that follows enumeration order.
  # This is what gets written to host_interfaces.port.
  def stable_path
    by_id || by_path || device
  end

  # Which of the three identity sources stable_path came from. Surfaced in the
  # UI because the guarantees differ: by_id follows the adapter, by_path follows
  # the USB socket, device follows nothing.
  def identity_basis
    return "by_id"   if by_id
    return "by_path" if by_path

    "device"
  end

  # There is deliberately no decoder. Ids are only ever compared against ids
  # from a fresh scan (see HostPortApi#by_ids), so no client-supplied string is
  # ever turned back into a filesystem path.
  def id
    Base64.urlsafe_encode64(stable_path, padding: false)
  end
end
