class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  # A transaction that need not survive a power cut (runner and poller writes).
  # Postgres batches the WAL flush instead of syncing on every commit, which
  # saves SD card writes. Never use for operator-initiated writes. Nested in an
  # outer transaction, the setting applies to that whole transaction.
  def self.async_commit_transaction(**options)
    transaction(**options) do
      with_connection { |connection| connection.execute("SET LOCAL synchronous_commit = off") }
      yield
    end
  end
end
