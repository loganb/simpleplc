class AddLockVersionToApplicationTables < ActiveRecord::Migration[8.1]
  def change
    %i[host_interfaces devices logic_diagrams measurements logic_blocks output_blocks traces].each do |table|
      add_column table, :lock_version, :integer, default: 0, null: false
    end
  end
end
