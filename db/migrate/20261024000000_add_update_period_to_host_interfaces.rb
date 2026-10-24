class AddUpdatePeriodToHostInterfaces < ActiveRecord::Migration[8.1]
  def change
    add_column :host_interfaces, :update_period, :integer, null: false, default: 10
  end
end
