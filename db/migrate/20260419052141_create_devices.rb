class CreateDevices < ActiveRecord::Migration[8.1]
  def change
    create_table :devices do |t|
      t.references :host_interface, null: false, foreign_key: true
      t.integer :modbus_address, null: false
      t.string :name
      t.string :driver, null: false

      t.timestamps
    end
  end
end
