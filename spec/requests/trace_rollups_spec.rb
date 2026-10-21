require "rails_helper"

RSpec.describe "Trace rollups API", type: :request do
  let(:instance) { LogicInstance.create!(logic_diagram: LogicDiagram.create!(name: "Boiler"), name: "Boiler room") }
  let(:other) { LogicInstance.create!(logic_diagram: instance.logic_diagram, name: "Other room") }
  let(:t0) { Time.utc(2026, 10, 13, 12) }

  before do
    [ 0, 1, 2 ].each do |minute|
      TraceRollup.create!(logic_instance: instance, bucket_start: t0 + minute.minutes, sample_count: 60,
        results: { "schema_version" => 1, "logic_inputs" => { "1" => { "null_count" => 0, "count" => 60 } } })
    end
    TraceRollup.create!(logic_instance: other, bucket_start: t0, sample_count: 5)
  end

  def query(params)
    get "/trace_rollups", params: { q: params.to_json }
  end

  def starts
    response.parsed_body.fetch("trace_rollups").map { |rollup| Time.iso8601(rollup.fetch("bucket_start")) }
  end

  it "returns one instance's rollups in the time range, newest first" do
    query(logic_instance_id: instance.id, since: (t0 + 1.minute).iso8601)

    expect(response).to have_http_status(:ok)
    expect(starts).to eq([ t0 + 2.minutes, t0 + 1.minute ])
    expect(response.parsed_body.fetch("trace_rollups").first).to include("sample_count" => 60, "logic_instance_id" => instance.id)
  end

  it "bounds by until (exclusive) and caps the limit" do
    query(logic_instance_id: instance.id, until: (t0 + 2.minutes).iso8601, limit: 1)

    expect(starts).to eq([ t0 + 1.minute ])
  end

  it "requires an instance" do
    query({})

    expect(response).to have_http_status(:unprocessable_content)
  end

  it "is read-only" do
    post "/trace_rollups", params: { trace_rollup: { logic_instance_id: instance.id } }
    expect(response).to have_http_status(:not_found).or have_http_status(:method_not_allowed)

    delete "/trace_rollups/#{TraceRollup.first.id}"
    expect(TraceRollup.count).to eq(4)
  end
end
