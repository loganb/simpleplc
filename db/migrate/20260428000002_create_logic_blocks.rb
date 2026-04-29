class CreateLogicBlocks < ActiveRecord::Migration[8.1]
  def change
    create_table :logic_blocks do |t|
      t.references :logic_diagram, null: false, foreign_key: true
      t.string :name, null: false
      t.string :block_type, null: false
      t.integer :stratum, null: false, default: 1
      t.json :input_expressions, null: false, default: {}
      t.json :config, null: false, default: {}

      t.timestamps
    end

    add_index :logic_blocks, [ :logic_diagram_id, :stratum ]
  end
end
