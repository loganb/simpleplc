class CreateData < ActiveRecord::Migration[8.1]
  def change
    create_table :data do |t|
      t.string :source_type, null: false
      t.integer :source_id, null: false
      t.float :value
      t.jsonb :state, null: false, default: {}
      t.jsonb :input_values, null: false, default: {}
      t.datetime :recorded_at, null: false

      t.timestamps
    end

    add_index :data, [ :source_type, :source_id, :recorded_at ]
  end
end
