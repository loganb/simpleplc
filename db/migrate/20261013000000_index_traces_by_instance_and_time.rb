class IndexTracesByInstanceAndTime < ActiveRecord::Migration[8.1]
  def change
    # The composite index also serves lookups by logic_instance_id alone.
    add_index :traces, [ :logic_instance_id, :recorded_at ]
    remove_index :traces, :logic_instance_id
  end
end
