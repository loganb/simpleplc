require "set"

class ModelStoreChannel < ApplicationCable::Channel
  MAX_INTERESTS = 10_000
  periodically :flush_changes, every: 0.1

  def subscribed
    @state_lock = Mutex.new
    @interests = Set.new
    @pending = {}
    @generation = -1
    stream_from RecordChanges::STREAM, coder: ActiveSupport::JSON do |message|
      receive_change(message)
    end
  end

  def interests(data)
    data = data.deep_stringify_keys
    generation = data["generation"]
    records = data["records"]
    unless generation.is_a?(Integer) && generation >= 0 &&
        records.is_a?(Array) && records.length <= MAX_INTERESTS &&
        records.all? { |record| valid_interest?(record) }
      transmit({ type: "protocol_error", message: "Invalid record interests" })
      return
    end

    @state_lock.synchronize do
      return if generation <= @generation

      @generation = generation
      @interests = records.map { |record| [ record["resource"], record["id"] ] }.to_set
      @pending.keep_if { |key, _| @interests.include?(key) }
      # Replacement is atomic. Client reconciles new interests after this ack,
      # covering updates between its first fetch and this subscription.
      transmit({ type: "interests_ack", generation: generation })
    end
  end

  private

  def valid_interest?(record)
    record.is_a?(Hash) && RecordResources::APIS.key?(record["resource"]) &&
      record["id"].is_a?(Integer) && record["id"].positive?
  end

  def receive_change(message)
    if %w[stream_unavailable resync_required].include?(message["type"])
      transmit({ type: message["type"] })
      return
    end
    resource = RecordResources.resource_for(message["model"])
    id = message["id"]
    version = message["lock_version"]
    return unless resource && id.is_a?(Integer) && version.is_a?(Integer) && version >= 0

    @state_lock.synchronize do
      key = [ resource, id ]
      return unless @interests.include?(key)

      @pending[key] = [ @pending.fetch(key, -1), version ].max
    end
  end

  def flush_changes
    return unless @state_lock

    # Channel actions, stream callbacks and timers can run on different workers.
    @state_lock.synchronize do
      records = []
      @pending.group_by { |(resource, _id), _version| resource }.each do |resource, entries|
        ids = entries.map { |(_resource, id), _version| id }
        allowed = RecordResources.scope(resource, principal).where(id: ids).pluck(:id).to_set
        entries.each do |(_resource, id), version|
          next unless allowed.include?(id) && @interests.include?([ resource, id ])

          records << { resource: resource, id: id, lock_version: version }
        end
      end
      @pending.clear
      transmit({ type: "record_updates", records: records }) if records.any?
    end
  end
end
