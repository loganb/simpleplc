class AddIoLabelsToDevices < ActiveRecord::Migration[8.1]
  def change
    add_column :devices, :io_labels, :jsonb, default: {}, null: false
  end
end
