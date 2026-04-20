class CreateHostInterfaces < ActiveRecord::Migration[8.1]
  def change
    create_table :host_interfaces do |t|
      t.string :port, null: false
      t.integer :baud_rate, null: false, default: 9600
      t.integer :data_bits, null: false, default: 8
      t.integer :stop_bits, null: false, default: 1
      t.string :parity, null: false, default: "none"

      t.timestamps
    end
  end
end
