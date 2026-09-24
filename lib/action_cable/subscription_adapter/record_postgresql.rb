require "action_cable/subscription_adapter/postgresql"

module ActionCable
  module SubscriptionAdapter
    # Keep Rails' transactional publisher and local subscriber routing. Extend
    # only listener recovery: sockets can remain open while PostgreSQL reconnects.
    class RecordPostgresql < PostgreSQL
      private

      def listener
        @listener || @server.mutex.synchronize { @listener ||= Listener.new(self, @server.event_loop) }
      end

      class Listener < PostgreSQL::Listener
        def listen
          registrations = {}
          recovering = false
          until @stopping
            begin
              @adapter.with_subscriptions_connection do |connection|
                registrations.each do |channel, callbacks|
                  connection.exec("LISTEN #{connection.escape_identifier(channel)}")
                  callbacks.each { |callback| @event_loop.post(&callback) }
                  callbacks.clear
                end
                announce(registrations, "resync_required") if recovering
                recovering = false

                last_probe = Process.clock_gettime(Process::CLOCK_MONOTONIC)
                until @stopping
                  until @queue.empty?
                    action, channel, callback = @queue.pop(true)
                    case action
                    when :listen
                      callbacks = (registrations[channel] ||= [])
                      callbacks << callback if callback
                      connection.exec("LISTEN #{connection.escape_identifier(channel)}")
                      callbacks.each { |success| @event_loop.post(&success) }
                      callbacks.clear
                    when :unlisten
                      registrations.delete(channel)
                      connection.exec("UNLISTEN #{connection.escape_identifier(channel)}")
                    end
                  end
                  connection.wait_for_notify(0.25) { |channel, _pid, payload| broadcast(channel, payload) }
                  # Also detect a broken connection when no model writes arrive.
                  now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
                  if now - last_probe >= 5
                    connection.exec("SELECT 1")
                    last_probe = now
                  end
                end
              end
            rescue PG::Error, ActiveRecord::ConnectionNotEstablished, ActiveRecord::ConnectionFailed => error
              ActionCable.server.config.logger.warn("Record stream disconnected: #{error.class}")
              announce(registrations, "stream_unavailable")
              recovering = true
              sleep 0.25 unless @stopping
            end
          end
        end

        def shutdown
          @stopping = true
          @thread.join
        end

        private

        def announce(registrations, type)
          payload = ActiveSupport::JSON.encode(type: type)
          registrations.each_key { |channel| broadcast(channel, payload) }
        end
      end
    end
  end
end
