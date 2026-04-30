class MoveUpdatePeriodToLogicDiagrams < ActiveRecord::Migration[8.1]
  def up
    add_column :logic_diagrams, :update_period, :integer, null: false, default: 60
    remove_column :measurements, :update_period
  end

  def down
    add_column :measurements, :update_period, :integer, null: false, default: 60
    remove_column :logic_diagrams, :update_period
  end
end
