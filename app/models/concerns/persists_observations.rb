# Persistence retries must never repeat hardware IO. Only explicitly supplied
# observation fields are reapplied after a concurrent operator edit.
module PersistsObservations
  extend ActiveSupport::Concern

  def persist_observation(attributes, identity: {})
    attempts = 0
    begin
      return false unless identity.all? { |field, value| public_send(field) == value }

      assign_attributes(attributes)
      save!
    rescue ActiveRecord::StaleObjectError
      attempts += 1
      raise if attempts >= 3

      reload
      retry
    rescue ActiveRecord::RecordNotFound
      false
    end
  rescue ActiveRecord::StaleObjectError, ActiveRecord::RecordNotFound,
         ActiveRecord::RecordInvalid, ActiveRecord::RecordNotSaved => error
    Rails.logger.warn("Poller: unable to persist #{self.class.name} #{id}: #{error.class}: #{error.message}")
    false
  end
end
