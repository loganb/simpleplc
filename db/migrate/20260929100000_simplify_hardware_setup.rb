# Scans become a patchable state machine (a `cancelling` state replaces the
# cancel flag) and batch reconciliation is gone, so its idempotency record goes.
class SimplifyHardwareSetup < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE host_interfaces SET scan_state = 'cancelling' WHERE scan_state = 'scanning' AND scan_cancel_requested"
    remove_column :host_interfaces, :scan_cancel_requested
    remove_column :host_interfaces, :last_apply
  end

  def down
    add_column :host_interfaces, :scan_cancel_requested, :boolean, default: false, null: false
    add_column :host_interfaces, :last_apply, :jsonb, default: {}, null: false
    execute "UPDATE host_interfaces SET scan_state = 'scanning', scan_cancel_requested = true WHERE scan_state = 'cancelling'"
  end
end
