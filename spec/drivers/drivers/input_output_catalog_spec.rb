require "rails_helper"

RSpec.describe "driver input and output catalogs" do
  it "describes relay inputs and outputs without logic-diagram terminology" do
    expect(Drivers::N4D8B08.inputs.first).to eq(
      path: "inputs[0]", label: "Input 1", value_type: "boolean", units: nil
    )
    expect(Drivers::N4D8B08.inputs.last[:path]).to eq("inputs[7]")
    expect(Drivers::N4D8B08.outputs.first).to eq(
      channel: 1, label: "Relay 1", value_type: "boolean", units: nil
    )
    expect(Drivers::N4D8B08.outputs.last[:channel]).to eq(8)
  end

  it "describes temperature channels as numeric Celsius inputs" do
    expect(Drivers::N4DSC08.inputs).to have_attributes(size: 8)
    expect(Drivers::N4DSC08.inputs.first).to eq(
      path: "temperatures[0]", label: "Temperature 1", value_type: "number", units: "°C"
    )
    expect(Drivers::N4DSC08.outputs).to be_empty

    expect(Drivers::NT48C32.inputs).to have_attributes(size: 32)
    expect(Drivers::NT48C32.inputs.last[:path]).to eq("temperatures[31]")
    expect(Drivers::NT48C32.outputs).to be_empty
  end
end
