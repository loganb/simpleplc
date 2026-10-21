# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_13_000002) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "devices", force: :cascade do |t|
    t.integer "configuration_revision", default: 0, null: false
    t.datetime "created_at", null: false
    t.jsonb "current_state"
    t.string "driver", null: false
    t.bigint "host_interface_id", null: false
    t.jsonb "io_labels", default: {}, null: false
    t.datetime "last_polled_at"
    t.integer "lock_version", default: 0, null: false
    t.integer "modbus_address", null: false
    t.string "name"
    t.jsonb "settings", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["host_interface_id"], name: "index_devices_on_host_interface_id"
    t.unique_constraint ["host_interface_id", "modbus_address"], deferrable: :immediate, name: "devices_bus_address"
  end

  create_table "host_interfaces", force: :cascade do |t|
    t.integer "baud_rate", default: 9600, null: false
    t.integer "configuration_revision", default: 0, null: false
    t.string "connection_error"
    t.datetime "created_at", null: false
    t.integer "data_bits", default: 8, null: false
    t.boolean "enabled", default: true, null: false
    t.integer "lock_version", default: 0, null: false
    t.string "name", null: false
    t.boolean "online", default: false, null: false
    t.string "parity", default: "none", null: false
    t.datetime "poller_reported_at"
    t.string "port", null: false
    t.string "port_identity"
    t.datetime "scan_finished_at"
    t.jsonb "scan_options", default: {}, null: false
    t.string "scan_request_id"
    t.datetime "scan_requested_at"
    t.jsonb "scan_results", default: {}, null: false
    t.datetime "scan_started_at"
    t.string "scan_state", default: "idle", null: false
    t.datetime "scan_updated_at"
    t.integer "stop_bits", default: 1, null: false
    t.datetime "updated_at", null: false
    t.index ["port_identity"], name: "index_host_interfaces_on_port_identity", unique: true
  end

  create_table "logic_blocks", force: :cascade do |t|
    t.jsonb "config", default: {}, null: false
    t.datetime "created_at", null: false
    t.jsonb "input_expressions", default: {}, null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_diagram_id", null: false
    t.string "name", null: false
    t.text "notes", default: "", null: false
    t.integer "stratum", default: 1, null: false
    t.string "type", null: false
    t.datetime "updated_at", null: false
    t.index ["logic_diagram_id", "stratum"], name: "index_logic_blocks_on_logic_diagram_id_and_stratum"
    t.index ["logic_diagram_id"], name: "index_logic_blocks_on_logic_diagram_id"
  end

  create_table "logic_diagrams", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "lock_version", default: 0, null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "logic_input_bindings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "device_id"
    t.jsonb "fixed_value"
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_input_id", null: false
    t.bigint "logic_instance_id", null: false
    t.string "source_kind", null: false
    t.string "source_path"
    t.datetime "updated_at", null: false
    t.index ["device_id"], name: "index_logic_input_bindings_on_device_id"
    t.index ["logic_input_id"], name: "index_logic_input_bindings_on_logic_input_id"
    t.index ["logic_instance_id", "logic_input_id"], name: "index_logic_input_bindings_on_instance_and_input", unique: true
    t.index ["logic_instance_id"], name: "index_logic_input_bindings_on_logic_instance_id"
  end

  create_table "logic_inputs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_diagram_id", null: false
    t.string "name", null: false
    t.string "units"
    t.datetime "updated_at", null: false
    t.string "value_type", default: "number", null: false
    t.index ["logic_diagram_id", "name"], name: "index_logic_inputs_on_logic_diagram_id_and_name", unique: true
    t.index ["logic_diagram_id"], name: "index_logic_inputs_on_logic_diagram_id"
  end

  create_table "logic_instance_states", force: :cascade do |t|
    t.bigint "logic_instance_id", null: false
    t.datetime "recorded_at", null: false
    t.jsonb "results", default: {}, null: false
    t.index ["logic_instance_id"], name: "index_logic_instance_states_on_logic_instance_id", unique: true
  end

  create_table "logic_instances", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_diagram_id", null: false
    t.string "name", null: false
    t.boolean "output_enable", default: false, null: false
    t.integer "update_period", default: 60, null: false
    t.datetime "updated_at", null: false
    t.index ["logic_diagram_id"], name: "index_logic_instances_on_logic_diagram_id"
    t.index ["name"], name: "index_logic_instances_on_name", unique: true
  end

  create_table "logic_output_bindings", force: :cascade do |t|
    t.integer "channel", null: false
    t.datetime "created_at", null: false
    t.bigint "device_id", null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_instance_id", null: false
    t.bigint "logic_output_id", null: false
    t.boolean "output_enable", default: true, null: false
    t.string "target_kind", default: "device_output", null: false
    t.datetime "updated_at", null: false
    t.index ["device_id"], name: "index_logic_output_bindings_on_device_id"
    t.index ["logic_instance_id", "logic_output_id"], name: "index_logic_output_bindings_on_instance_and_output", unique: true
    t.index ["logic_instance_id"], name: "index_logic_output_bindings_on_logic_instance_id"
    t.index ["logic_output_id"], name: "index_logic_output_bindings_on_logic_output_id"
  end

  create_table "logic_outputs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "input_expression", null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_diagram_id", null: false
    t.string "name", null: false
    t.string "units"
    t.datetime "updated_at", null: false
    t.string "value_type", default: "boolean", null: false
    t.index ["logic_diagram_id", "name"], name: "index_logic_outputs_on_logic_diagram_id_and_name", unique: true
    t.index ["logic_diagram_id"], name: "index_logic_outputs_on_logic_diagram_id"
  end

  create_table "trace_rollups", force: :cascade do |t|
    t.datetime "bucket_start", null: false
    t.bigint "logic_instance_id", null: false
    t.jsonb "results", default: {}, null: false
    t.integer "sample_count", null: false
    t.index ["bucket_start"], name: "index_trace_rollups_on_bucket_start"
    t.index ["logic_instance_id", "bucket_start"], name: "index_trace_rollups_on_logic_instance_id_and_bucket_start", unique: true
  end

  create_table "traces", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "logic_instance_id", null: false
    t.datetime "recorded_at", null: false
    t.jsonb "results", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["logic_instance_id", "recorded_at"], name: "index_traces_on_logic_instance_id_and_recorded_at"
  end

  add_foreign_key "devices", "host_interfaces"
  add_foreign_key "logic_blocks", "logic_diagrams"
  add_foreign_key "logic_input_bindings", "devices"
  add_foreign_key "logic_input_bindings", "logic_inputs"
  add_foreign_key "logic_input_bindings", "logic_instances"
  add_foreign_key "logic_inputs", "logic_diagrams"
  add_foreign_key "logic_instance_states", "logic_instances"
  add_foreign_key "logic_instances", "logic_diagrams"
  add_foreign_key "logic_output_bindings", "devices"
  add_foreign_key "logic_output_bindings", "logic_instances"
  add_foreign_key "logic_output_bindings", "logic_outputs"
  add_foreign_key "logic_outputs", "logic_diagrams"
  add_foreign_key "trace_rollups", "logic_instances"
  add_foreign_key "traces", "logic_instances"
end
