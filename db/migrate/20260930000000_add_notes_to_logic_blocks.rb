class AddNotesToLogicBlocks < ActiveRecord::Migration[8.1]
  def change
    add_column :logic_blocks, :notes, :text, default: "", null: false
  end
end
