# NOTIFY is transactional only when published synchronously on the writer's
# PostgreSQL connection. Never move this callback to after_commit or a job.
module ObservesRecordChanges
  extend ActiveSupport::Concern

  included do
    after_update :publish_record_change, if: :saved_change_to_lock_version?
  end

  private

  def publish_record_change
    RecordChanges.publish(self)
  end
end
