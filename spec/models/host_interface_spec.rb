require "rails_helper"

RSpec.describe HostInterface, type: :model do
  it "opens an RTU client with the interface serial settings" do
    interface = described_class.new(
      port: "/dev/ttyUSB0",
      baud_rate: 19_200,
      data_bits: 7,
      stop_bits: 2,
      parity: "even"
    )
    yielded_client = Object.new
    block_client = nil

    expect(ModBus::RTUClient).to receive(:connect).with(
      "/dev/ttyUSB0",
      19_200,
      data_bits: 7,
      stop_bits: 2,
      parity: :even
    ).and_yield(yielded_client)

    interface.modbus_client do |client|
      block_client = client
    end

    expect(block_client).to eq(yielded_client)
  end
end
