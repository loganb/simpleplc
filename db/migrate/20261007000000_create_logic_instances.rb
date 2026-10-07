class CreateLogicInstances < ActiveRecord::Migration[8.1]
  class DiagramRecord < ActiveRecord::Base
    self.table_name = "logic_diagrams"
  end

  class InstanceRecord < ActiveRecord::Base
    self.table_name = "logic_instances"
  end

  class InputRecord < ActiveRecord::Base
    self.table_name = "logic_inputs"
  end

  class OutputRecord < ActiveRecord::Base
    self.table_name = "logic_outputs"
  end

  class TraceRecord < ActiveRecord::Base
    self.table_name = "traces"
  end

  def up
    rename_table :measurements, :logic_inputs
    rename_table :output_blocks, :logic_outputs

    add_column :logic_inputs, :value_type, :string, null: false, default: "number"
    add_column :logic_outputs, :value_type, :string, null: false, default: "boolean"
    add_column :logic_outputs, :units, :string

    create_table :logic_instances do |t|
      t.references :logic_diagram, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :update_period, null: false, default: 60
      t.boolean :output_enable, null: false, default: false
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :logic_instances, :name, unique: true

    create_table :logic_input_bindings do |t|
      t.references :logic_instance, null: false, foreign_key: true
      t.references :logic_input, null: false, foreign_key: true
      t.string :source_kind, null: false
      t.references :device, null: true, foreign_key: true
      t.string :source_path
      t.jsonb :fixed_value
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :logic_input_bindings,
      [ :logic_instance_id, :logic_input_id ],
      unique: true,
      name: "index_logic_input_bindings_on_instance_and_input"

    create_table :logic_output_bindings do |t|
      t.references :logic_instance, null: false, foreign_key: true
      t.references :logic_output, null: false, foreign_key: true
      t.string :target_kind, null: false, default: "device_output"
      t.references :device, null: false, foreign_key: true
      t.integer :channel, null: false
      t.boolean :output_enable, null: false, default: true
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :logic_output_bindings,
      [ :logic_instance_id, :logic_output_id ],
      unique: true,
      name: "index_logic_output_bindings_on_instance_and_output"
    add_reference :traces, :logic_instance, null: true, foreign_key: true

    reset_migration_models!
    backfill_instances!

    change_column_null :traces, :logic_instance_id, false
    remove_reference :traces, :logic_diagram, foreign_key: true

    remove_reference :logic_inputs, :device, foreign_key: true
    remove_column :logic_inputs, :mode, :string
    remove_column :logic_inputs, :source_path, :string
    remove_column :logic_inputs, :simulation_value, :float

    remove_reference :logic_outputs, :device, foreign_key: true
    remove_column :logic_outputs, :channel, :integer
    remove_column :logic_outputs, :output_enable, :boolean

    remove_column :logic_diagrams, :update_period, :integer
    remove_column :logic_diagrams, :output_enable, :boolean
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "logic instances can multiply after migration and cannot be collapsed back into one diagram configuration"
  end

  private

  def reset_migration_models!
    [ DiagramRecord, InstanceRecord, InputRecord, OutputRecord, TraceRecord ].each(&:reset_column_information)
  end

  def backfill_instances!
    used_names = {}

    DiagramRecord.order(:id).find_each do |diagram|
      instance = InstanceRecord.create!(
        logic_diagram_id: diagram.id,
        name: unique_instance_name(diagram.name, diagram.id, used_names),
        update_period: diagram.update_period,
        output_enable: diagram.output_enable,
        created_at: diagram.created_at,
        updated_at: diagram.updated_at
      )

      InputRecord.where(logic_diagram_id: diagram.id).find_each do |input|
        attributes = input.attributes
        if attributes["mode"] == "simulation"
          execute insert_binding_sql(
            "logic_input_bindings",
            logic_instance_id: instance.id,
            logic_input_id: input.id,
            source_kind: "fixed_value",
            fixed_value: connection.quote(attributes["simulation_value"].to_json),
            created_at: connection.quote(input.created_at),
            updated_at: connection.quote(input.updated_at)
          )
        elsif attributes["device_id"].present? && attributes["source_path"].present?
          execute insert_binding_sql(
            "logic_input_bindings",
            logic_instance_id: instance.id,
            logic_input_id: input.id,
            source_kind: "device_input",
            device_id: attributes["device_id"],
            source_path: connection.quote(attributes["source_path"]),
            created_at: connection.quote(input.created_at),
            updated_at: connection.quote(input.updated_at)
          )
        end
      end

      OutputRecord.where(logic_diagram_id: diagram.id).find_each do |output|
        attributes = output.attributes
        execute insert_binding_sql(
          "logic_output_bindings",
          logic_instance_id: instance.id,
          logic_output_id: output.id,
          target_kind: "device_output",
          device_id: attributes.fetch("device_id"),
          channel: attributes.fetch("channel"),
          output_enable: connection.quote(attributes.fetch("output_enable")),
          created_at: connection.quote(output.created_at),
          updated_at: connection.quote(output.updated_at)
        )
      end

      TraceRecord.where(logic_diagram_id: diagram.id).update_all(logic_instance_id: instance.id)
    end
  end

  def unique_instance_name(name, id, used_names)
    candidate = name
    candidate = "#{name} (#{id})" if used_names[candidate]
    used_names[candidate] = true
    candidate
  end

  def insert_binding_sql(table, attributes)
    columns = attributes.keys.join(", ")
    quoted_values = attributes.map do |key, value|
      if %i[logic_instance_id logic_input_id logic_output_id device_id channel].include?(key)
        value
      elsif key == :output_enable || %i[fixed_value source_path created_at updated_at].include?(key)
        value
      else
        connection.quote(value)
      end
    end
    "INSERT INTO #{table} (#{columns}) VALUES (#{quoted_values.join(', ')})"
  end
end
