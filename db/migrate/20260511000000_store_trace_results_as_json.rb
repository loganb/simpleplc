class StoreTraceResultsAsJson < ActiveRecord::Migration[8.1]
  def change
    add_column :traces, :results, :jsonb, null: false, default: {}

    drop_table :data do |t|
      t.datetime "created_at", null: false
      t.jsonb "input_values", default: {}, null: false
      t.datetime "recorded_at", null: false
      t.integer "source_id", null: false
      t.string "source_type", null: false
      t.jsonb "state", default: {}, null: false
      t.integer "trace_id", null: false
      t.datetime "updated_at", null: false
      t.float "value"
      t.index [ "source_type", "source_id", "recorded_at" ], name: "index_data_on_source_type_and_source_id_and_recorded_at"
      t.index [ "trace_id", "source_type", "source_id" ], name: "index_data_on_trace_id_and_source_type_and_source_id"
      t.index [ "trace_id" ], name: "index_data_on_trace_id"
    end
  end
end
