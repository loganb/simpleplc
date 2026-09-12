class AddNameToHostInterfaces < ActiveRecord::Migration[8.1]
  def up
    add_column :host_interfaces, :name, :string

    # Existing interfaces are identified by their port in the UI; keep that as
    # the name so nothing renders blank. New interfaces get a name suggested
    # from the adapter's USB product string during a port scan.
    execute <<~SQL.squish
      UPDATE host_interfaces SET name = port WHERE name IS NULL OR name = ''
    SQL

    change_column_null :host_interfaces, :name, false
  end

  def down
    remove_column :host_interfaces, :name
  end
end
