class AddTraceScopedMeasurements < ActiveRecord::Migration[8.1]
  def up
    add_reference :measurements, :logic_diagram, foreign_key: true
    add_column :measurements, :mode, :string, null: false, default: "acquisition"
    add_column :measurements, :simulation_value, :float

    create_table :traces do |t|
      t.references :logic_diagram, null: false, foreign_key: true
      t.datetime :recorded_at, null: false
      t.timestamps
    end
    add_index :traces, [ :logic_diagram_id, :created_at ]

    add_reference :data, :trace, foreign_key: true
    add_index :data, [ :trace_id, :source_type, :source_id ]

    execute "DELETE FROM data"
    execute "DELETE FROM logic_blocks"
    execute "DELETE FROM logic_diagrams"

    if select_value("SELECT COUNT(*) FROM measurements").to_i.positive?
      now = quote(Time.current)
      execute <<~SQL.squish
        INSERT INTO logic_diagrams (name, created_at, updated_at)
        VALUES ('Default', #{now}, #{now})
      SQL
      default_diagram_id = select_value("SELECT id FROM logic_diagrams WHERE name = 'Default' ORDER BY id DESC LIMIT 1")

      duplicate_ids = select_values(<<~SQL.squish)
        SELECT m.id
        FROM measurements m
        WHERE m.id NOT IN (
          SELECT MIN(id)
          FROM measurements
          GROUP BY name
        )
      SQL
      unless duplicate_ids.empty?
        ids = duplicate_ids.join(",")
        execute "DELETE FROM measurement_data WHERE measurement_id IN (#{ids})"
        execute "DELETE FROM measurements WHERE id IN (#{ids})"
      end

      execute "UPDATE measurements SET logic_diagram_id = #{default_diagram_id}"
    end

    change_column_null :measurements, :logic_diagram_id, false
    change_column_null :data, :trace_id, false
    add_index :measurements, [ :logic_diagram_id, :name ], unique: true
  end

  def down
    remove_index :measurements, [ :logic_diagram_id, :name ]
    remove_reference :data, :trace, foreign_key: true
    drop_table :traces
    remove_column :measurements, :simulation_value
    remove_column :measurements, :mode
    remove_reference :measurements, :logic_diagram, foreign_key: true
  end
end
