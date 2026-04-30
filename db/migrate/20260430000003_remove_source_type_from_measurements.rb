class RemoveSourceTypeFromMeasurements < ActiveRecord::Migration[8.1]
  def up
    remove_column :measurements, :source_type
  end

  def down
    add_column :measurements, :source_type, :string, null: false, default: "device"
  end
end
