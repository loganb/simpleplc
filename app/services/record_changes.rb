module RecordChanges
  STREAM = "plc_record_changes_v1".freeze

  def self.publish(record)
    ActionCable.server.broadcast(STREAM, {
      model: record.class.name,
      id: record.id,
      lock_version: record.lock_version
    })
  end
end
