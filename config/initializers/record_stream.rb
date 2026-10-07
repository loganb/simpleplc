# Adapter code is process infrastructure and must not be reloaded mid-listen.
require Rails.root.join("lib/action_cable/subscription_adapter/record_postgresql")

Rails.application.config.action_cable.allowed_request_origins =
  ENV.fetch("PLC_CABLE_ORIGINS", "").split(",").map(&:strip).reject(&:empty?).then do |origins|
    if Rails.env.development?
      development_origins = [ "http://localhost:5173", "http://localhost:5174" ]
      development_origins << "http://#{ENV['PLC_DEV_HOST']}:5174" if ENV["PLC_DEV_HOST"].present?
      origins + development_origins
    else
      origins
    end
  end
# Action Cable still allows same-origin requests. No credential/login mechanism
# is introduced here; configure x.record_authenticator when one is available.

Rails.application.config.x.record_authenticator = nil
