class CreateLogicDiagrams < ActiveRecord::Migration[8.1]
  def change
    create_table :logic_diagrams do |t|
      t.string :name, null: false

      t.timestamps
    end
  end
end
