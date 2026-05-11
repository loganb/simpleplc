class AddOutputEnableToLogicDiagrams < ActiveRecord::Migration[8.1]
  def change
    add_column :logic_diagrams, :output_enable, :boolean, null: false, default: false
  end
end
