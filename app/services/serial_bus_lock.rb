require "digest"
require "fileutils"

class SerialBusLock
  def self.identity(port)
    real = File.realpath(port)
    stat = File.stat(real)
    stat.chardev? ? "device:#{stat.rdev}" : "file:#{stat.dev}:#{stat.ino}"
  end

  def self.acquire(port)
    identity = self.identity(port)
    root = ENV.fetch("PLC_SERIAL_LOCK_DIR", "/tmp/plc-controller-serial-#{Process.uid}")
    FileUtils.mkdir_p(root, mode: 0700)
    file = File.open(File.join(root, Digest::SHA256.hexdigest(identity)), File::RDWR | File::CREAT, 0600)
    unless file.flock(File::LOCK_EX | File::LOCK_NB)
      file.close
      raise HardwareError.new("Serial adapter is in use by another process", code: "port_busy")
    end
    unless identity == self.identity(port)
      file.close
      raise HardwareError, "Serial adapter changed while acquiring ownership"
    end
    file
  end
end
