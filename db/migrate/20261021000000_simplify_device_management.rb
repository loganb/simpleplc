# Scans move off host_interfaces into their own table, and the second
# optimistic lock (configuration_revision) goes. See
# claude/device-management-simplify.md. Scan state is transient, so nothing is
# carried over; reversing restores the columns empty.
class SimplifyDeviceManagement < ActiveRecord::Migration[8.1]
  def change
    create_table :device_scans do |t|
      t.references :host_interface, null: false, foreign_key: true
      t.integer :first_address, null: false
      t.integer :last_address, null: false
      t.string :state, null: false, default: "pending"
      t.integer :completed, null: false, default: 0
      t.integer :total, null: false
      t.jsonb :results, null: false, default: []
      t.string :error
      t.datetime :started_at
      t.datetime :finished_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    remove_column :host_interfaces, :configuration_revision, :integer, default: 0, null: false
    remove_column :devices, :configuration_revision, :integer, default: 0, null: false
    remove_column :host_interfaces, :scan_state, :string, default: "idle", null: false
    remove_column :host_interfaces, :scan_request_id, :string
    remove_column :host_interfaces, :scan_options, :jsonb, default: {}, null: false
    remove_column :host_interfaces, :scan_results, :jsonb, default: {}, null: false
    remove_column :host_interfaces, :scan_requested_at, :datetime
    remove_column :host_interfaces, :scan_started_at, :datetime
    remove_column :host_interfaces, :scan_finished_at, :datetime
    remove_column :host_interfaces, :scan_updated_at, :datetime
  end
end
