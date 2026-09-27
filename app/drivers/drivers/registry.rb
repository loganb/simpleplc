module Drivers
  module Registry
    def self.all = [ N4DSC08, NT48C32, N4D8B08 ]
    def self.find(key) = all.find { |driver| driver.name == key }
    def self.fetch(key) = find(key) || raise(ArgumentError, "Unsupported driver #{key}")
    def self.metadata
      all.map do |driver|
        { id: driver.name, name: driver.display_name, channel_count: driver.channel_count,
          fields: driver == N4D8B08 ? %w[inputs outputs] : %w[temperatures],
          binary_outputs: driver == N4D8B08,
          configuration_effects: driver == N4D8B08 ? "Sets inputs and outputs to unrelated mode when normal polling starts." : "None" }
      end
    end
  end
end
