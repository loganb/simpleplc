class ConvertLogicBlocksToSti < ActiveRecord::Migration[8.1]
  def up
    rename_column :logic_blocks, :block_type, :type
    execute <<~SQL.squish
      UPDATE logic_blocks
      SET type = CASE type
        WHEN 'hysteresis' THEN 'HysteresisLogicBlock'
        WHEN 'latch' THEN 'LatchLogicBlock'
        ELSE type
      END
    SQL
  end

  def down
    execute <<~SQL.squish
      UPDATE logic_blocks
      SET type = CASE type
        WHEN 'HysteresisLogicBlock' THEN 'hysteresis'
        WHEN 'LatchLogicBlock' THEN 'latch'
        ELSE type
      END
    SQL
    rename_column :logic_blocks, :type, :block_type
  end
end
