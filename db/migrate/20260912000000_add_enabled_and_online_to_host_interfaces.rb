class AddEnabledAndOnlineToHostInterfaces < ActiveRecord::Migration[8.1]
  def change
    # Operator intent. Existing buses keep polling across the deploy.
    add_column :host_interfaces, :enabled, :boolean, null: false, default: true

    # The poller's report that it is holding the port open. Never seeded true:
    # an "online" that no poller wrote is a lie about the hardware. The first
    # poll cycle after deploy corrects it.
    add_column :host_interfaces, :online, :boolean, null: false, default: false

    # Heartbeat, so a dead poller's stale `online` can be disbelieved.
    add_column :host_interfaces, :poller_reported_at, :datetime

    # Why the port isn't open. Device-level read errors stay in
    # devices.current_state; this is only about the port itself.
    add_column :host_interfaces, :connection_error, :string
  end
end
