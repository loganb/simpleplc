class CreateInstanceMeasurementHistory < ActiveRecord::Migration[8.1]
  def change
    create_table :measurements do |t|
      t.string :name, null: false
      t.references :logic_instance, foreign_key: true
      t.string :source_type
      t.bigint :source_id
      t.integer :lock_version, null: false, default: 0
      t.timestamps
      t.index :name, unique: true
      t.index [ :source_type, :source_id ]
      t.check_constraint "(logic_instance_id IS NULL AND source_type IS NULL AND source_id IS NULL) OR (logic_instance_id IS NOT NULL AND source_type IS NOT NULL AND source_type IN ('LogicInput', 'LogicOutput') AND source_id IS NOT NULL)", name: "measurements_attachment_tuple"
    end
    create_table :measurement_samples do |t|
      t.references :measurement, null: false, foreign_key: true
      t.datetime :recorded_at, null: false
      t.jsonb :snapshot, null: false
      t.boolean :rolled_up, null: false, default: false
      t.timestamps
      t.index [ :measurement_id, :recorded_at, :id ]
      t.index [ :measurement_id, :recorded_at, :id ], where: "rolled_up = false", name: "index_measurement_samples_pending_rollup"
    end
    create_table :measurement_rollups do |t|
      t.references :measurement, null: false, foreign_key: true
      t.datetime :bucket_start, null: false
      t.integer :sample_count, null: false
      t.jsonb :summaries, null: false
      t.timestamps
      t.index [ :measurement_id, :bucket_start ], unique: true
    end
  end
end
