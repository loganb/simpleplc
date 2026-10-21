require "rails_helper"

RSpec.describe "Traces API", type: :request do
  it "creates a trace and returns computed results" do
    diagram = LogicDiagram.create!(name: "Boiler")
    input = LogicInput.create!(logic_diagram: diagram, name: "Temp")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Boiler room")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 10.0)

    post "/traces", params: { trace: { logic_instance_id: instance.id } }

    expect(response).to have_http_status(:created)
    trace_id = response.parsed_body.fetch("id")
    expect(response.parsed_body).not_to have_key("data")
    trace = response.parsed_body.fetch("traces").find { |candidate| candidate.fetch("id") == trace_id }
    expect(trace.fetch("results").fetch("logic_inputs").fetch(input.id.to_s)).to include(
      "id" => input.id,
      "name" => "Temp",
      "value" => 10.0
    )
  end

  describe "time range queries" do
    let(:instance) { LogicInstance.create!(logic_diagram: LogicDiagram.create!(name: "Boiler"), name: "Boiler room") }
    let(:t0) { Time.utc(2026, 10, 13, 12) }

    before do
      [ 0, 60, 120 ].each { |offset| Trace.create!(logic_instance: instance, recorded_at: t0 + offset) }
    end

    def recorded_ats
      response.parsed_body.fetch("traces").map { |trace| Time.iso8601(trace.fetch("recorded_at")) }
    end

    it "bounds by since (inclusive) and until (exclusive), newest first" do
      get "/traces", params: { q: { logic_instance_id: instance.id, since: (t0 + 60).iso8601, until: (t0 + 120).iso8601 }.to_json }

      expect(response).to have_http_status(:ok)
      expect(recorded_ats).to eq([ t0 + 60 ])
    end

    it "applies each bound alone and keeps the limit" do
      get "/traces", params: { q: { logic_instance_id: instance.id, since: (t0 + 60).iso8601, limit: 1 }.to_json }

      expect(recorded_ats).to eq([ t0 + 120 ])
    end

    it "rejects a malformed time" do
      get "/traces", params: { q: { logic_instance_id: instance.id, since: "yesterday" }.to_json }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  it "does not notify or rewrite a trace after inserting it" do
    instance = LogicInstance.create!(logic_diagram: LogicDiagram.create!(name: "Boiler"), name: "Boiler room")
    updates = []
    callback = ->(record) { updates << record.id }
    Trace.set_callback(:update, :after, callback)
    begin
      Trace.create!(logic_instance: instance)
    ensure
      Trace.skip_callback(:update, :after, callback)
    end

    expect(updates).to be_empty
  end

  it "keeps a Compute now request synchronous and serialized behind the state row lock" do
    instance = LogicInstance.create!(logic_diagram: LogicDiagram.create!(name: "Boiler"), name: "Boiler room")
    modes = []
    statements = []
    allow(Logic::TraceEvaluator).to receive(:evaluate!).and_wrap_original do |original, *args|
      modes << ActiveRecord::Base.connection.select_value("SHOW synchronous_commit")
      original.call(*args)
    end
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") { |*, payload| statements << payload[:sql] }

    post "/traces", params: { trace: { logic_instance_id: instance.id } }

    ActiveSupport::Notifications.unsubscribe(subscriber)
    expect(response).to have_http_status(:created)
    expect(modes).to eq([ "on" ])
    expect(statements.grep(/logic_instance_states.*FOR UPDATE/m)).not_to be_empty
  end
end
