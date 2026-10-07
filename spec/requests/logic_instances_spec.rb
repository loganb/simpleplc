require "rails_helper"

RSpec.describe "Logic instances API", type: :request do
  let(:diagram) { LogicDiagram.create!(name: "Temperature Control") }

  it "creates and live-edits an instance" do
    post "/logic_instances", params: {
      logic_instance: {
        logic_diagram_id: diagram.id,
        name: "Greenhouse Zone 1",
        update_period: 30,
        output_enable: false
      }
    }
    expect(response).to have_http_status(:created)
    id = response.parsed_body.fetch("id")

    patch "/logic_instances/#{id}", params: { logic_instance: { output_enable: true } }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("logic_instances").first).to include(
      "name" => "Greenhouse Zone 1",
      "logic_diagram_id" => diagram.id,
      "update_period" => 30,
      "output_enable" => true
    )
  end

  it "clears old bindings and traces when the diagram changes" do
    input = LogicInput.create!(logic_diagram: diagram, name: "Setpoint")
    instance = LogicInstance.create!(logic_diagram: diagram, name: "Zone 1")
    LogicInputBinding.create!(logic_instance: instance, logic_input: input, source_kind: "fixed_value", fixed_value: 68)
    Trace.create!(logic_instance: instance)
    other = LogicDiagram.create!(name: "Other")

    patch "/logic_instances/#{instance.id}", params: { logic_instance: { logic_diagram_id: other.id } }

    expect(response).to have_http_status(:ok)
    expect(instance.reload.logic_diagram).to eq(other)
    expect(instance.logic_input_bindings).to be_empty
    expect(instance.traces).to be_empty
  end
end
