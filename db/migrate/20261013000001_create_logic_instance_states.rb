class CreateLogicInstanceStates < ActiveRecord::Migration[8.1]
  # Plain models so the backfill doesn't depend on application code.
  class MigrationInstance < ActiveRecord::Base
    self.table_name = "logic_instances"
  end

  class MigrationTrace < ActiveRecord::Base
    self.table_name = "traces"
  end

  class MigrationBlock < ActiveRecord::Base
    self.table_name = "logic_blocks"
    self.inheritance_column = nil
  end

  class MigrationState < ActiveRecord::Base
    self.table_name = "logic_instance_states"
  end

  BATCH = 200

  def up
    create_table :logic_instance_states do |t|
      t.references :logic_instance, null: false, foreign_key: true, index: { unique: true }
      t.datetime :recorded_at, null: false
      t.jsonb :results, null: false, default: {}
    end

    MigrationState.reset_column_information
    MigrationInstance.find_each { |instance| backfill(instance) }
  end

  def down
    drop_table :logic_instance_states
  end

  private

  # The latest trace's results, plus any block result it lacks taken from the
  # newest older trace that has one (what BlockEvaluator#previous_result did).
  # Instances that never ran get their row on first evaluation.
  def backfill(instance)
    traces = MigrationTrace.where(logic_instance_id: instance.id).order(recorded_at: :desc, id: :desc)
    latest = traces.first
    return unless latest

    results = latest.results.deep_dup
    results["logic_blocks"] ||= {}
    missing = MigrationBlock.where(logic_diagram_id: instance.logic_diagram_id).pluck(:id).map(&:to_s) -
      results["logic_blocks"].keys
    offset = 1
    until missing.empty?
      batch = traces.offset(offset).limit(BATCH).pluck(:results)
      break if batch.empty?

      batch.each do |older|
        found = missing & older.to_h.fetch("logic_blocks", {}).keys
        found.each { |id| results["logic_blocks"][id] = older["logic_blocks"][id] }
        missing -= found
      end
      offset += BATCH
    end

    MigrationState.create!(logic_instance_id: instance.id, recorded_at: latest.recorded_at, results: results)
  end
end
