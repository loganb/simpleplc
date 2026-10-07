module Drivers
  module Registry
    def self.all = [ N4DSC08, NT48C32, N4D8B08, WJ150 ]
    def self.find(key) = all.find { |driver| driver.name == key }
    def self.fetch(key) = find(key) || raise(ArgumentError, "Unsupported driver #{key}")
    def self.metadata
      all.map do |driver|
        input_fields = driver.inputs.filter_map { |input| input[:path][/\A\w+/] }.uniq
        output_fields = driver.outputs.any? ? [ "outputs" ] : []
        { id: driver.name, name: driver.display_name, channel_count: driver.channel_count,
          fields: input_fields + output_fields,
          inputs: driver.inputs,
          outputs: driver.outputs,
          binary_outputs: driver.outputs.any? { |output| output[:value_type] == "boolean" },
          settings: driver.settings_schema,
          configuration_effects: driver.configuration_effects }
      end
    end
  end
end
