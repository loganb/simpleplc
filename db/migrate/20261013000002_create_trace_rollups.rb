class CreateTraceRollups < ActiveRecord::Migration[8.1]
  def change
    create_table :trace_rollups do |t|
      t.references :logic_instance, null: false, foreign_key: true, index: false
      t.datetime :bucket_start, null: false
      t.integer :sample_count, null: false
      t.jsonb :results, null: false, default: {}
      t.index [ :logic_instance_id, :bucket_start ], unique: true
      t.index :bucket_start
    end
  end
end
