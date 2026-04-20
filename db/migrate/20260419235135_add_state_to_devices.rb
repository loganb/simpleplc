class AddStateToDevices < ActiveRecord::Migration[8.1]
  def change
    add_column :devices, :current_state, :json
    add_column :devices, :last_polled_at, :datetime
  end
end
