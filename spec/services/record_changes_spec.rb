require "rails_helper"
require "pg"
require "timeout"

RSpec.describe "Transactional record changes" do
  self.use_transactional_tests = false

  before do
    @server = ActionCable::Server::Base.new(config: ActionCable::Server::Base.config.dup)
    @server.config.cable = { "adapter" => "record_postgresql" }
    allow(ActionCable).to receive(:server).and_return(@server)
    @listener = ActiveRecord::Base.connection_pool.new_connection
    @pg = @listener.raw_connection
    @pg.exec("LISTEN plc_record_changes_v1")
    @interface = HostInterface.create!(name: "Notification test", port: "/dev/missing")
  end

  after do
    @interface&.reload&.destroy!
    @listener&.disconnect!
    @server&.pubsub&.shutdown
  end

  def receive_change(timeout = 0.15)
    message = nil
    @pg.wait_for_notify(timeout) { |_channel, _pid, payload| message = JSON.parse(payload) }
    message
  end

  it "publishes only after commit on the writing connection" do
    HostInterface.transaction do
      @interface.update!(name: "Committed")
      expect(receive_change).to be_nil
    end
    expect(receive_change(2)).to include("model" => "HostInterface", "id" => @interface.id, "lock_version" => 1)
  end

  it "discards rolled back and savepoint-rolled-back updates" do
    HostInterface.transaction do
      @interface.update!(name: "Rollback")
      raise ActiveRecord::Rollback
    end
    expect(receive_change).to be_nil
    HostInterface.transaction do
      HostInterface.transaction(requires_new: true) do
        @interface.reload.update!(name: "Savepoint")
        raise ActiveRecord::Rollback
      end
    end
    expect(receive_change).to be_nil
  end

  it "ignores creation, no-op saves and non-opted-in models" do
    expect(receive_change).to be_nil
    @interface.save!
    expect(receive_change).to be_nil
    unobserved = Class.new(ApplicationRecord) { self.table_name = "host_interfaces" }
    unobserved.find(@interface.id).update!(name: "Unobserved")
    expect(receive_change).to be_nil
  end

  it "delivers an update from another process" do
    # A fresh connection in the child avoids sharing the parent's database socket.
    pid = fork do
      ActiveRecord::Base.establish_connection
      HostInterface.find(@interface.id).update!(name: "Child writer")
      exit! 0
    rescue Exception
      exit! 1
    end
    begin
      expect(receive_change(5)).to include("id" => @interface.id, "lock_version" => 1)
    ensure
      Process.wait(pid)
    end
    expect($?.success?).to be(true)
  end
end
