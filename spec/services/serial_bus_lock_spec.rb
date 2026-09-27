require "rails_helper"
require "tmpdir"

RSpec.describe SerialBusLock do
  it "excludes a second process even through an alias, and releases on close" do
    Dir.mktmpdir do |dir|
      port = File.join(dir, "port")
      link = File.join(dir, "alias")
      File.write(port, "")
      File.symlink(port, link)
      held = described_class.acquire(port)
      reader, writer = IO.pipe
      pid = fork do
        reader.close
        held.close
        begin
          described_class.acquire(link).close
          writer.write("unexpected acquisition")
        rescue HardwareError
          writer.write("busy")
        ensure
          writer.close
          exit! 0
        end
      end
      writer.close
      expect(reader.read).to eq("busy")
      Process.wait(pid)
      held.close
      described_class.acquire(link).close
    ensure
      reader&.close
      held&.close unless held&.closed?
    end
  end

  it "rejects two configured aliases of the same adapter" do
    Dir.mktmpdir do |dir|
      port = File.join(dir, "port")
      File.write(port, "")
      link = File.join(dir, "alias")
      File.symlink(port, link)
      HostInterface.create!(name: "First", port: port)
      duplicate = HostInterface.new(name: "Second", port: link)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:port_identity]).not_to be_empty
    end
  end
end
