require "rails_helper"
require "timeout"

RSpec.describe "PostgreSQL record listener recovery" do
  self.use_transactional_tests = false

  it "fans out once per local subscriber and reconciles after its database session dies" do
    servers = 2.times.map do
      server = ActionCable::Server::Base.new(config: ActionCable::Server::Base.config.dup)
      server.config.cable = { "adapter" => "record_postgresql" }
      server.config.logger = Rails.logger
      server
    end
    queues = servers.map { Queue.new }
    ready = Queue.new
    pids = Queue.new
    servers.each_with_index do |server, index|
      adapter = server.pubsub
      allow(adapter).to receive(:with_subscriptions_connection).and_wrap_original do |original, &block|
        original.call do |pg|
          pids << pg.backend_pid
          block.call(pg)
        end
      end
      adapter.subscribe("plc_listener_test", ->(payload) { queues[index] << JSON.parse(payload) }, -> { ready << true })
    end
    2.times { Timeout.timeout(5) { ready.pop } }
    original_pids = 2.times.map { Timeout.timeout(5) { pids.pop } }
    servers.first.broadcast("plc_listener_test", { value: 1 })
    queues.each { |queue| expect(Timeout.timeout(5) { queue.pop }).to eq("value" => 1) }

    ActiveRecord::Base.connection.execute("SELECT pg_terminate_backend(#{Integer(original_pids.first)})")
    # Only the killed adapter reports its own lost continuity.
    index = nil
    Timeout.timeout(5) do
      loop do
        index = queues.index { |queue| !queue.empty? }
        break if index
        sleep 0.01
      end
    end
    expect(queues[index].pop).to eq("type" => "stream_unavailable")
    expect(Timeout.timeout(5) { queues[index].pop }).to eq("type" => "resync_required")
    servers.first.broadcast("plc_listener_test", { value: 2 })
    queues.each { |queue| expect(Timeout.timeout(5) { queue.pop }).to eq("value" => 2) }
    expect(queues).to all(be_empty)
  ensure
    servers&.each { |server| server.pubsub.shutdown }
  end
end
