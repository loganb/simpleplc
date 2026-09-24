require "rails_helper"

RSpec.describe ApplicationCable::Connection, type: :channel do
  after { Rails.application.config.x.record_authenticator = nil }

  it "allows anonymous connections while no authenticator is configured" do
    connect
    expect(connection.principal).to eq(:anonymous)
  end

  it "authenticates once on connect and rejects invalid credentials" do
    authenticator = double(call: nil)
    Rails.application.config.x.record_authenticator = authenticator
    expect { connect }.to have_rejected_connection
    expect(authenticator).to have_received(:call).once
  end
end
