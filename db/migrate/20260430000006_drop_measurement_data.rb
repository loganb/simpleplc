class DropMeasurementData < ActiveRecord::Migration[8.1]
  def change
    drop_table :measurement_data do |t|
      t.references :measurement, null: false, foreign_key: true
      t.float :value
      t.datetime :recorded_at, null: false

      t.index [ :measurement_id, :recorded_at ]
    end
  end
end
