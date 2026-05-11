class CreateOutputBlocks < ActiveRecord::Migration[8.1]
  def change
    create_table :output_blocks do |t|
      t.references :logic_diagram, null: false, foreign_key: true
      t.references :device, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :channel, null: false
      t.string :input_expression, null: false
      t.boolean :output_enable, null: false, default: false

      t.timestamps
    end

    add_index :output_blocks, [ :logic_diagram_id, :name ], unique: true
    add_index :output_blocks, [ :logic_diagram_id, :device_id, :channel ], unique: true
  end
end
