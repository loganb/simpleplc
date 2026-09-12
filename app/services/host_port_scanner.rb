# Enumerates the serial ports physically present on this host.
#
# Everything here is a filesystem read — sysfs, /dev/serial symlinks, and
# /proc/consoles. The scanner never opens a serial port, so it is safe to run
# from the web process while the poller is transacting on a bus. (That is not
# true of scanning a bus for Modbus devices, which is why that is a separate
# problem; see claude/host-port-scan.md.)
#
# All roots are injectable so specs can point the scanner at a fake tree.
class HostPortScanner
  SYS_TTY_ROOT  = "/sys/class/tty".freeze
  BY_ID_DIR     = "/dev/serial/by-id".freeze
  BY_PATH_DIR   = "/dev/serial/by-path".freeze
  DEV_DIR       = "/dev".freeze
  CONSOLES_PATH = "/proc/consoles".freeze

  # USB descriptor attributes read from the ancestor USB device directory.
  USB_ATTRIBUTES = %w[idVendor idProduct manufacturer product serial].freeze

  attr_reader :sys_tty_root, :by_id_dir, :by_path_dir, :dev_dir, :consoles_path

  def initialize(sys_tty_root: SYS_TTY_ROOT, by_id_dir: BY_ID_DIR, by_path_dir: BY_PATH_DIR,
                 dev_dir: DEV_DIR, consoles_path: CONSOLES_PATH)
    @sys_tty_root  = sys_tty_root
    @by_id_dir     = by_id_dir
    @by_path_dir   = by_path_dir
    @dev_dir       = dev_dir
    @consoles_path = consoles_path
  end

  def self.scan = new.scan

  # Returns HostPorts for every real serial port, sorted by tty name.
  def scan
    by_id_links   = alias_links(by_id_dir)
    by_path_links = alias_links(by_path_dir)
    consoles      = console_ttys

    tty_names.sort.map do |tty|
      device = File.join(dev_dir, tty)
      key    = real_path(device)
      usb    = usb_attributes(tty)

      HostPort.new(
        tty:              tty,
        device:           device,
        by_id:            by_id_links[key],
        by_path:          by_path_links[key],
        label:            label_for(tty, usb),
        kernel_driver:    kernel_driver(tty),
        usb_vendor_id:    usb["idVendor"],
        usb_product_id:   usb["idProduct"],
        usb_manufacturer: usb["manufacturer"],
        usb_product:      usb["product"],
        usb_serial:       usb["serial"],
        console:          consoles.include?(tty)
      )
    end
  end

  private

  # A tty is a real serial port when a kernel driver is bound to its device.
  # Ptys and virtual consoles have no device/driver link, which filters this
  # Pi's ~70 tty nodes down to the two actual ports.
  def tty_names
    Dir.children(sys_tty_root).select { |tty| File.exist?(driver_link(tty)) }
  rescue Errno::ENOENT
    []
  end

  def driver_link(tty) = File.join(sys_tty_root, tty, "device", "driver")

  def kernel_driver(tty)
    File.basename(real_path(driver_link(tty)))
  end

  # Maps the realpath of each alias target back to the alias, so a port can find
  # the stable names that point at it.
  def alias_links(dir)
    Dir.children(dir).each_with_object({}) do |name, links|
      link = File.join(dir, name)
      links[real_path(link)] = link
    end
  rescue Errno::ENOENT
    {}
  end

  # USB descriptors live on an ancestor of the tty's device directory (the tty
  # hangs off an interface, the descriptors sit on the USB device itself), so
  # walk up until we find one carrying idVendor.
  def usb_attributes(tty)
    dir = real_path(File.join(sys_tty_root, tty, "device"))

    while dir && dir != "/"
      if File.exist?(File.join(dir, "idVendor"))
        return USB_ATTRIBUTES.index_with { |attr| read_attribute(File.join(dir, attr)) }.compact
      end

      dir = File.dirname(dir)
    end

    {}
  end

  def label_for(tty, usb)
    usb_label = [ usb["manufacturer"], usb["product"] ].compact_blank.join(" ")
    return usb_label if usb_label.present?

    compatible(tty) || tty
  end

  # Device-tree "compatible" string for platform UARTs, e.g. "arm,pl011-axi".
  # The attribute is NUL-separated when a node lists several.
  def compatible(tty)
    path = File.join(real_path(File.join(sys_tty_root, tty, "device")).to_s, "of_node", "compatible")
    read_attribute(path)&.split("\u0000")&.first.presence
  end

  def console_ttys
    File.readlines(consoles_path).filter_map { |line| line.split(/\s+/).first.presence }
  rescue Errno::ENOENT
    []
  end

  def read_attribute(path)
    File.read(path).strip.presence
  rescue SystemCallError
    nil
  end

  def real_path(path)
    File.realpath(path)
  rescue SystemCallError
    path
  end
end
