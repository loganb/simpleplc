class CreateMeasurements < ActiveRecord::Migration[8.1]
  def change
    create_table :measurements do |t|
      t.string :name, null: false
      t.string :source_type, null: false, default: "device"
      t.references :device, null: true, foreign_key: true
      t.string :source_path
      t.integer :update_period, null: false, default: 60
      t.string :units

      t.timestamps
    end
  end
end
