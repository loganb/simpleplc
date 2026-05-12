# frozen_string_literal: true

namespace :postgres do
  desc "Import local SQLite app data into the current PostgreSQL database"
  task import_sqlite: :environment do
    require "json"
    require "sqlite3"

    sqlite_path = ENV.fetch("SQLITE_DB", Rails.root.join("storage/development.sqlite3").to_s)
    force = ENV["FORCE"] == "1"

    unless File.exist?(sqlite_path)
      abort "SQLite database not found: #{sqlite_path}"
    end

    unless ActiveRecord::Base.connection.adapter_name.match?(/postgres/i)
      abort "postgres:import_sqlite must run against a PostgreSQL database"
    end

    tables = %w[
      host_interfaces
      devices
      logic_diagrams
      measurements
      logic_blocks
      output_blocks
      traces
    ]
    json_columns = {
      "devices" => %w[current_state],
      "logic_blocks" => %w[input_expressions config],
      "traces" => %w[results]
    }

    sqlite = SQLite3::Database.new(sqlite_path)
    sqlite.results_as_hash = true

    ActiveRecord::Base.transaction do
      tables.each do |table|
        target_count = ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM #{table}").to_i
        if target_count.positive? && !force
          abort "#{table} is not empty; rerun with FORCE=1 to import anyway"
        end
      end

      if force
        ActiveRecord::Base.connection.disable_referential_integrity do
          tables.reverse_each { |table| ActiveRecord::Base.connection.execute("TRUNCATE TABLE #{table} RESTART IDENTITY CASCADE") }
        end
      end

      tables.each do |table|
        rows = sqlite.execute("SELECT * FROM #{table}")
        next if rows.empty?

        model = Class.new(ApplicationRecord) do
          self.table_name = table
        end

        rows.each do |row|
          attributes = row.except(*row.keys.grep(/\A\d+\z/))
          Array(json_columns[table]).each do |column|
            attributes[column] = parse_json_value(attributes[column])
          end
          model.insert!(attributes)
        end

        reset_sequence!(table)
        puts "Imported #{rows.size} #{table} rows"
      end
    ensure
      sqlite.close
    end
  end

  def parse_json_value(value)
    return nil if value.nil?
    return value unless value.is_a?(String)

    JSON.parse(value)
  rescue JSON::ParserError
    value
  end

  def reset_sequence!(table)
    quoted_table = ActiveRecord::Base.connection.quote(table)
    ActiveRecord::Base.connection.execute(<<~SQL.squish)
      SELECT setval(
        pg_get_serial_sequence(#{quoted_table}, 'id'),
        COALESCE((SELECT MAX(id) FROM #{ActiveRecord::Base.connection.quote_table_name(table)}), 1),
        (SELECT COUNT(*) FROM #{ActiveRecord::Base.connection.quote_table_name(table)}) > 0
      )
    SQL
  end
end
