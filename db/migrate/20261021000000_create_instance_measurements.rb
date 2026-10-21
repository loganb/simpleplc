class CreateInstanceMeasurements < ActiveRecord::Migration[8.1]
  def change
    create_table :measurements do |t|
      t.string :name, null: false
      t.string :units
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :measurements, :name, unique: true

    create_table :measurement_sources do |t|
      t.references :measurement, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.references :logic_instance, null: false, foreign_key: { on_delete: :cascade }
      t.references :logic_input, foreign_key: { on_delete: :cascade }
      t.references :logic_output, foreign_key: { on_delete: :cascade }
      t.timestamps
      t.check_constraint "(logic_input_id IS NOT NULL) <> (logic_output_id IS NOT NULL)", name: "measurement_source_one_port"
    end

    create_table :measurement_samples do |t|
      t.references :measurement, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.datetime :recorded_at, null: false
      t.jsonb :value
      t.index [ :measurement_id, :recorded_at, :id ]
    end

    create_table :measurement_rollups do |t|
      t.references :measurement, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.datetime :bucket_start, null: false
      t.integer :sample_count, null: false
      t.jsonb :stats, null: false, default: {}
      t.index [ :measurement_id, :bucket_start ], unique: true
      t.index :bucket_start
    end
  end
end
