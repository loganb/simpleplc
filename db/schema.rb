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

ActiveRecord::Schema[8.1].define(version: 2026_04_30_000003) do
  create_table "data", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.json "input_values", default: {}, null: false
    t.datetime "recorded_at", null: false
    t.integer "source_id", null: false
    t.string "source_type", null: false
    t.json "state", default: {}, null: false
    t.integer "trace_id", null: false
    t.datetime "updated_at", null: false
    t.float "value"
    t.index ["source_type", "source_id", "recorded_at"], name: "index_data_on_source_type_and_source_id_and_recorded_at"
    t.index ["trace_id", "source_type", "source_id"], name: "index_data_on_trace_id_and_source_type_and_source_id"
    t.index ["trace_id"], name: "index_data_on_trace_id"
  end

  create_table "devices", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.json "current_state"
    t.string "driver", null: false
    t.integer "host_interface_id", null: false
    t.datetime "last_polled_at"
    t.integer "modbus_address", null: false
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["host_interface_id"], name: "index_devices_on_host_interface_id"
  end

  create_table "host_interfaces", force: :cascade do |t|
    t.integer "baud_rate", default: 9600, null: false
    t.datetime "created_at", null: false
    t.integer "data_bits", default: 8, null: false
    t.string "parity", default: "none", null: false
    t.string "port", null: false
    t.integer "stop_bits", default: 1, null: false
    t.datetime "updated_at", null: false
  end

  create_table "logic_blocks", force: :cascade do |t|
    t.json "config", default: {}, null: false
    t.datetime "created_at", null: false
    t.json "input_expressions", default: {}, null: false
    t.integer "logic_diagram_id", null: false
    t.string "name", null: false
    t.integer "stratum", default: 1, null: false
    t.string "type", null: false
    t.datetime "updated_at", null: false
    t.index ["logic_diagram_id", "stratum"], name: "index_logic_blocks_on_logic_diagram_id_and_stratum"
    t.index ["logic_diagram_id"], name: "index_logic_blocks_on_logic_diagram_id"
  end

  create_table "logic_diagrams", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "update_period", default: 60, null: false
    t.datetime "updated_at", null: false
  end

  create_table "measurement_data", force: :cascade do |t|
    t.integer "measurement_id", null: false
    t.datetime "recorded_at", null: false
    t.float "value"
    t.index ["measurement_id", "recorded_at"], name: "index_measurement_data_on_measurement_id_and_recorded_at"
    t.index ["measurement_id"], name: "index_measurement_data_on_measurement_id"
  end

  create_table "measurements", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "device_id"
    t.integer "logic_diagram_id", null: false
    t.string "mode", default: "acquisition", null: false
    t.string "name", null: false
    t.float "simulation_value"
    t.string "source_path"
    t.string "units"
    t.datetime "updated_at", null: false
    t.index ["device_id"], name: "index_measurements_on_device_id"
    t.index ["logic_diagram_id", "name"], name: "index_measurements_on_logic_diagram_id_and_name", unique: true
    t.index ["logic_diagram_id"], name: "index_measurements_on_logic_diagram_id"
  end

  create_table "traces", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "logic_diagram_id", null: false
    t.datetime "recorded_at", null: false
    t.datetime "updated_at", null: false
    t.index ["logic_diagram_id", "created_at"], name: "index_traces_on_logic_diagram_id_and_created_at"
    t.index ["logic_diagram_id"], name: "index_traces_on_logic_diagram_id"
  end

  add_foreign_key "data", "traces"
  add_foreign_key "devices", "host_interfaces"
  add_foreign_key "logic_blocks", "logic_diagrams"
  add_foreign_key "measurement_data", "measurements"
  add_foreign_key "measurements", "devices"
  add_foreign_key "measurements", "logic_diagrams"
  add_foreign_key "traces", "logic_diagrams"
end
