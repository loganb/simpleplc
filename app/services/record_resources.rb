# Only these API-backed resources can appear on the record-update wire.
# Resolve classes on each use so development reloads cannot retain old classes.
module RecordResources
  APIS = {
    "device" => "DeviceApi",
    "host_interface" => "HostInterfaceApi",
    "logic_diagram" => "LogicDiagramApi",
    "measurement" => "MeasurementApi",
    "logic_block" => "LogicBlockApi",
    "output_block" => "OutputBlockApi",
    "trace" => "TraceApi"
  }.freeze
  MODELS = {
    "Device" => "device", "HostInterface" => "host_interface",
    "LogicDiagram" => "logic_diagram", "Measurement" => "measurement",
    "LogicBlock" => "logic_block", "HysteresisLogicBlock" => "logic_block",
    "LatchLogicBlock" => "logic_block", "OutputBlock" => "output_block",
    "Trace" => "trace"
  }.freeze

  def self.api_class_name(klass)
    klass.respond_to?(:api_class_name) ? klass.api_class_name : klass.name
  end

  def self.resource_for(model_name)
    resource = MODELS[model_name]
    return unless resource

    # Verify the shared HTTP/API convention, including STI.
    klass = model_name.constantize
    resource if "#{api_class_name(klass)}Api" == APIS.fetch(resource)
  end

  def self.scope(resource, principal)
    APIS.fetch(resource).constantize.record_scope(principal)
  end
end
