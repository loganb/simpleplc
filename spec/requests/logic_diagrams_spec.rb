require "rails_helper"

RSpec.describe "Logic diagrams API", type: :request do
  it "creates and lists diagrams using the flat RestfulApi wire format" do
    post "/logic_diagrams", params: { logic_diagram: { name: "Boiler" } }

    expect(response).to have_http_status(:created)
    id = response.parsed_body.fetch("id")

    get "/logic_diagrams"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("query")).to include(id)
    expect(response.parsed_body.fetch("logic_diagrams").first).to include("name" => "Boiler")
  end
end
