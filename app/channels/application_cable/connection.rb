module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :principal

    def connect
      # No authentication system exists yet. Applications can configure a
      # callable returning a principal (nil/false rejects the connection).
      authenticator = Rails.application.config.x.record_authenticator
      self.principal = authenticator ? authenticator.call(self) : :anonymous
      reject_unauthorized_connection unless principal
    end
  end
end
