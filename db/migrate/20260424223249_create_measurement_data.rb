class CreateMeasurementData < ActiveRecord::Migration[8.1]
  def change
    create_table :measurement_data do |t|
      t.references :measurement, null: false, foreign_key: true
      t.float :value
      t.datetime :recorded_at, null: false
    end

    add_index :measurement_data, [ :measurement_id, :recorded_at ]
  end
end
