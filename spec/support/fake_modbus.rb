# Fakes for exercising the poller without a serial port.
#
# The poller's job is now lifecycle management — when a port is opened, held,
# and released — so these stand in for the two things it manages: the client
# and the driver built on top of it.

# Stands in for ModBus::RTUClient. Tracks whether the port is still open, which
# is the property the online/offline feature is about.
class FakeRtuClient
  attr_accessor :read_retry_timeout, :read_retries

  def initialize
    @closed = false
  end

  def closed? = @closed
  def close = @closed = true
  def with_slave(_address) = :slave
end

# A driver that counts its own instantiations and reads, so specs can tell
# "the poller reused what it had" from "the poller rebuilt it".
class FakePollerDriver < Drivers::Base
  class << self
    attr_accessor :instantiations, :reads, :read_behaviour

    def reset!
      self.instantiations = 0
      self.reads = 0
      self.read_behaviour = -> { { ok: true } }
    end
  end

  def initialize(device, slave)
    super
    self.class.instantiations += 1
  end

  def read
    self.class.reads += 1
    self.class.read_behaviour.call
  end
end
