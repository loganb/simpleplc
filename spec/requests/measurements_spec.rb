require "rails_helper"

RSpec.describe "Measurements API", type: :request do
  let(:diagram) { LogicDiagram.create!(name: "Control") }
  let(:instance) { LogicInstance.create!(logic_diagram: diagram, name: "Zone") }
  let(:input) { LogicInput.create!(logic_diagram: diagram, name: "Room") }
  let(:output) { LogicOutput.create!(logic_diagram: diagram, name: "Demand", input_expression: "Room > 20") }

  it "creates, reattaches, detaches and deletes a measurement without deleting other history" do
    post "/measurements", params: { measurement: { name: "Temperature", units: "°C", logic_instance_id: instance.id, logic_input_id: input.id } }
    expect(response).to have_http_status(:created)
    id = response.parsed_body.fetch("id")
    expect(response.parsed_body.fetch("measurements").first).to include("logic_instance_id" => instance.id, "logic_input_id" => input.id)

    patch "/measurements/#{id}", params: { measurement: { logic_instance_id: instance.id, logic_input_id: nil, logic_output_id: output.id } }
    expect(response).to have_http_status(:ok)
    expect(Measurement.find(id).measurement_source.logic_output_id).to eq(output.id)

    patch "/measurements/#{id}", params: { measurement: { logic_instance_id: nil, logic_input_id: nil, logic_output_id: nil } }
    expect(response).to have_http_status(:ok)
    expect(Measurement.find(id).measurement_source).to be_nil

    sample = MeasurementSample.create!(measurement_id: id, recorded_at: Time.current, value: 4)

    delete "/measurements/#{id}"
    expect(response).to have_http_status(:no_content)
    expect(Measurement.exists?(id)).to be(false)
    expect(MeasurementSample.exists?(sample.id)).to be(false)
  end

  it "rejects a port from another diagram" do
    other = LogicDiagram.create!(name: "Other")
    port = LogicInput.create!(logic_diagram: other, name: "Wrong")
    post "/measurements", params: { measurement: { name: "Bad", logic_instance_id: instance.id, logic_input_id: port.id } }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(Measurement.count).to eq(0)
  end
end
