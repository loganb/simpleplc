require "rails_helper"
require "tmpdir"

RSpec.describe HostPortScanner do
  # Builds a fake sysfs/dev tree so the scanner can be exercised without real hardware.
  #
  #   tty:     name of the tty node, e.g. "ttyUSB0"
  #   driver:  kernel driver name, or nil to omit the driver symlink entirely
  #            (which is how ptys and virtual consoles are excluded)
  #   usb:     hash of USB descriptor attributes, placed on an ancestor directory
  #   of_node: device-tree "compatible" string for platform UARTs
  class FakeHost
    attr_reader :root

    def initialize(root)
      @root = Pathname.new(root)
      @consoles = []
    end

    def add_tty(tty, driver: nil, usb: nil, of_node: nil)
      sys_tty = @root.join("sys/class/tty", tty)
      sys_tty.mkpath

      if driver
        # The tty's device lives in the platform/usb tree; /sys/class/tty/<n>/device
        # points at it, and <device>/driver points at the bound driver.
        device_dir = @root.join("sys/devices", tty)
        device_dir.mkpath
        driver_dir = @root.join("sys/bus/drivers", driver)
        driver_dir.mkpath
        FileUtils.ln_s(device_dir.to_s, sys_tty.join("device").to_s)
        FileUtils.ln_s(driver_dir.to_s, device_dir.join("driver").to_s)

        if usb
          # USB descriptors live on an ancestor of the tty's device directory.
          usb_dir = device_dir.join("..", "usbdev").cleanpath
          usb_dir.mkpath
          usb.each { |attr, value| usb_dir.join(attr.to_s).write("#{value}\n") }
          FileUtils.rm(device_dir.join("driver").to_s)
          nested = usb_dir.join("interface", tty)
          nested.mkpath
          FileUtils.ln_s(driver_dir.to_s, nested.join("driver").to_s)
          FileUtils.rm(sys_tty.join("device").to_s)
          FileUtils.ln_s(nested.to_s, sys_tty.join("device").to_s)
        end

        if of_node
          target = usb ? @root.join("sys/devices", tty) : device_dir
          target.join("of_node").mkpath
          target.join("of_node/compatible").write("#{of_node}\u0000")
        end
      end

      @root.join("dev").mkpath
      @root.join("dev", tty).write("")
      self
    end

    def add_link(kind, name, tty)
      dir = @root.join("dev/serial", kind)
      dir.mkpath
      FileUtils.ln_s(@root.join("dev", tty).to_s, dir.join(name).to_s)
      self
    end

    def add_console(tty)
      @consoles << tty
      self
    end

    def scanner
      consoles_path = @root.join("proc_consoles")
      consoles_path.write(@consoles.map { |t| "#{t}                 -W- (E   p a)  204:74\n" }.join)

      HostPortScanner.new(
        sys_tty_root: @root.join("sys/class/tty").to_s,
        by_id_dir:    @root.join("dev/serial/by-id").to_s,
        by_path_dir:  @root.join("dev/serial/by-path").to_s,
        dev_dir:      @root.join("dev").to_s,
        consoles_path: consoles_path.to_s
      )
    end
  end

  around do |example|
    Dir.mktmpdir { |dir| @host = FakeHost.new(dir); example.run }
  end

  attr_reader :host

  def usb_adapter(tty: "ttyUSB0", serial: "D30E7F3F")
    host.add_tty(tty, driver: "ftdi_sio", usb: {
      idVendor: "0403", idProduct: "6015",
      manufacturer: "FTDI", product: "FT230X Basic UART", serial: serial
    })
  end

  describe "enumeration" do
    it "returns only ttys with a bound kernel driver" do
      usb_adapter
      host.add_tty("ttyAMA10", driver: "port", of_node: "arm,pl011-axi")
      host.add_tty("ptmx")          # no driver symlink
      host.add_tty("tty1")          # virtual console, no driver symlink

      expect(host.scanner.scan.map(&:tty)).to contain_exactly("ttyUSB0", "ttyAMA10")
    end

    it "returns ports sorted by tty name for a stable UI ordering" do
      usb_adapter(tty: "ttyUSB1", serial: "BBB")
      usb_adapter(tty: "ttyUSB0", serial: "AAA")

      expect(host.scanner.scan.map(&:tty)).to eq(%w[ttyUSB0 ttyUSB1])
    end
  end

  describe "USB metadata" do
    it "reads descriptors from the ancestor USB device directory" do
      usb_adapter
      port = host.scanner.scan.first

      expect(port).to have_attributes(
        tty: "ttyUSB0",
        device: host.root.join("dev/ttyUSB0").to_s,
        kernel_driver: "ftdi_sio",
        usb_vendor_id: "0403",
        usb_product_id: "6015",
        usb_manufacturer: "FTDI",
        usb_product: "FT230X Basic UART",
        usb_serial: "D30E7F3F"
      )
    end

    it "labels a USB port with its manufacturer and product" do
      usb_adapter
      expect(host.scanner.scan.first.label).to eq("FTDI FT230X Basic UART")
    end
  end

  describe "platform ports" do
    it "labels a platform UART from its device-tree compatible string" do
      host.add_tty("ttyAMA10", driver: "port", of_node: "arm,pl011-axi")
      port = host.scanner.scan.first

      expect(port).to have_attributes(
        label: "arm,pl011-axi",
        kernel_driver: "port",
        usb_serial: nil,
        by_id: nil,
        by_path: nil
      )
    end

    it "takes the first entry when the node lists several compatible strings" do
      # Device-tree nodes list compatibles most-specific-first, NUL-separated.
      host.add_tty("ttyAMA10", driver: "port", of_node: "brcm,bcm2835-pl011\u0000arm,pl011")

      expect(host.scanner.scan.first.label).to eq("brcm,bcm2835-pl011")
    end

    it "falls back to the tty name when there is no label source at all" do
      host.add_tty("ttyS0", driver: "serial8250")
      expect(host.scanner.scan.first.label).to eq("ttyS0")
    end
  end

  describe "stable_path precedence" do
    it "prefers the by-id alias" do
      usb_adapter
      host.add_link("by-id", "usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0", "ttyUSB0")
      host.add_link("by-path", "platform-xhci-hcd.0-usb-0:1:1.0-port0", "ttyUSB0")
      port = host.scanner.scan.first

      expect(port.by_id).to end_with("usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0")
      expect(port.by_path).to end_with("platform-xhci-hcd.0-usb-0:1:1.0-port0")
      expect(port.stable_path).to eq(port.by_id)
      expect(port.identity_basis).to eq("by_id")
    end

    it "falls back to by-path for an adapter with no by-id alias" do
      usb_adapter
      host.add_link("by-path", "platform-xhci-hcd.0-usb-0:1:1.0-port0", "ttyUSB0")
      port = host.scanner.scan.first

      expect(port.by_id).to be_nil
      expect(port.stable_path).to eq(port.by_path)
      expect(port.identity_basis).to eq("by_path")
    end

    it "falls back to the raw device node when neither alias exists" do
      host.add_tty("ttyAMA10", driver: "port", of_node: "arm,pl011-axi")
      port = host.scanner.scan.first

      expect(port.stable_path).to eq(port.device)
      expect(port.identity_basis).to eq("device")
    end
  end

  describe "kernel console detection" do
    it "flags ttys listed in /proc/consoles" do
      usb_adapter
      host.add_tty("ttyAMA10", driver: "port", of_node: "arm,pl011-axi")
      host.add_console("ttyAMA10")

      by_tty = host.scanner.scan.index_by(&:tty)
      expect(by_tty.fetch("ttyAMA10").console).to be(true)
      expect(by_tty.fetch("ttyUSB0").console).to be(false)
    end
  end

  describe "default roots" do
    it "points at the real host paths" do
      scanner = HostPortScanner.new

      expect(scanner.sys_tty_root).to eq("/sys/class/tty")
      expect(scanner.by_id_dir).to eq("/dev/serial/by-id")
      expect(scanner.by_path_dir).to eq("/dev/serial/by-path")
      expect(scanner.consoles_path).to eq("/proc/consoles")
    end

    it "tolerates a host with no /dev/serial aliases at all" do
      usb_adapter
      FileUtils.rm_rf(host.root.join("dev/serial").to_s)

      expect { host.scanner.scan }.not_to raise_error
      expect(host.scanner.scan.first.by_id).to be_nil
    end
  end
end
