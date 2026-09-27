class AddHardwareSetup < ActiveRecord::Migration[8.1]
  def up
    duplicates = select_rows("SELECT host_interface_id, modbus_address FROM devices GROUP BY 1, 2 HAVING count(*) > 1")
    raise "Resolve duplicate device addresses before migrating: #{duplicates.inspect}" if duplicates.any?
    # Resolve existing claims before adding uniqueness; never silently pick one
    # of two configured aliases when production restarts on the new code.
    claims = select_rows("SELECT id, port FROM host_interfaces").filter_map do |id, port|
      begin
        stat = File.stat(File.realpath(port))
        key = stat.chardev? ? "device:#{stat.rdev}" : "file:#{stat.dev}:#{stat.ino}"
        [ id, key ]
      rescue SystemCallError
        nil
      end
    end
    conflicts = claims.group_by(&:last).values.select { |rows| rows.size > 1 }
    raise "Resolve duplicate adapter claims before migrating: #{conflicts.inspect}" if conflicts.any?
    add_column :host_interfaces, :configuration_revision, :integer, default: 0, null: false
    add_column :devices, :configuration_revision, :integer, default: 0, null: false
    add_column :host_interfaces, :port_identity, :string
    claims.each { |id, key| execute "UPDATE host_interfaces SET port_identity = #{connection.quote(key)} WHERE id = #{Integer(id)}" }
    add_index :host_interfaces, :port_identity, unique: true
    add_column :host_interfaces, :scan_state, :string, default: "idle", null: false
    add_column :host_interfaces, :scan_request_id, :string
    add_column :host_interfaces, :scan_options, :jsonb, default: {}, null: false
    add_column :host_interfaces, :scan_results, :jsonb, default: {}, null: false
    add_column :host_interfaces, :scan_cancel_requested, :boolean, default: false, null: false
    %i[requested started finished updated].each { |stage| add_column :host_interfaces, :"scan_#{stage}_at", :datetime }
    add_column :host_interfaces, :last_apply, :jsonb, default: {}, null: false
    execute "ALTER TABLE devices ADD CONSTRAINT devices_bus_address UNIQUE (host_interface_id, modbus_address) DEFERRABLE INITIALLY IMMEDIATE"
  end

  def down
    execute "ALTER TABLE devices DROP CONSTRAINT devices_bus_address"
    remove_column :devices, :configuration_revision
    %i[configuration_revision port_identity scan_state scan_request_id scan_options scan_results scan_cancel_requested scan_requested_at scan_started_at scan_finished_at scan_updated_at last_apply].each { |name| remove_column :host_interfaces, name }
  end
end
