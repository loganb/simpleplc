# Only these API-backed resources can appear on the record-update wire.
# Resolve classes on each use so development reloads cannot retain old classes.
module RecordResources
  APIS = {
    "device" => "DeviceApi",
    "host_interface" => "HostInterfaceApi",
    "logic_diagram" => "LogicDiagramApi",
    "logic_input" => "LogicInputApi",
    "logic_block" => "LogicBlockApi",
    "logic_output" => "LogicOutputApi",
    "logic_instance" => "LogicInstanceApi",
    "logic_input_binding" => "LogicInputBindingApi",
    "logic_output_binding" => "LogicOutputBindingApi",
    "trace" => "TraceApi",
    "trace_rollup" => "TraceRollupApi"
  }.freeze
  MODELS = {
    "Device" => "device", "HostInterface" => "host_interface",
    "LogicDiagram" => "logic_diagram", "LogicInput" => "logic_input",
    "LogicBlock" => "logic_block", "HysteresisLogicBlock" => "logic_block",
    "LatchLogicBlock" => "logic_block", "TimerCounterLogicBlock" => "logic_block",
    "ExpressionLogicBlock" => "logic_block",
    "LogicOutput" => "logic_output", "LogicInstance" => "logic_instance",
    "LogicInputBinding" => "logic_input_binding",
    "LogicOutputBinding" => "logic_output_binding",
    "Trace" => "trace", "TraceRollup" => "trace_rollup"
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
