#
# Base class for API objects paired with RestfulApiController.
#
# Subclass this as <ModelName>Api and override methods as needed.
# The controller discovers the API class automatically by convention.
#
# Minimal implementation for a read-only resource:
#
#   class DeviceApi < RestfulApi
#     def by_query(params)
#       Device.all
#     end
#   end
#
# Full CRUD example:
#
#   class ReadingApi < RestfulApi
#     def by_query(params)
#       device_id = params.require(:device_id)
#       Reading.where(device_id: device_id).order(recorded_at: :desc).limit(100)
#     end
#
#     def can_create(params)    = true
#     def can_update(obj, _)    = true
#     def can_destroy(obj)      = true
#
#     def create_params(params)
#       params.require(:reading).permit(:device_id, :register, :value, :recorded_at)
#     end
#   end
#
class RestfulApi
  # Shared with the record stream; override when authorization is introduced.
  # Receives connection identity, never an HTTP controller.
  def self.record_scope(_principal)
    name.delete_suffix("Api").constantize.all
  end

  attr_reader :controller

  def initialize(controller)
    @controller = controller
  end

  # ---------------------------------------------------------------------------
  # Fetch
  # ---------------------------------------------------------------------------

  # Returns objects by their IDs, preserving order, nil for missing entries.
  def by_ids(ids)
    objects = model_class.where(id: ids)
    ids.collect { |id| objects.find { |o| o.id == id } }
  end

  # Converts incoming ID strings to the appropriate type. Default: to_i.
  def canonicalize_ids(ids)
    ids.collect(&:to_i)
  end

  # Returns objects matching the query params. Must be overridden.
  def by_query(params)
    raise NotImplementedError, "#{self.class}#by_query not implemented"
  end

  # ---------------------------------------------------------------------------
  # Access control
  #
  # Each method returns a boolean or array of booleans parallel to the input.
  # Defaults to permissive — override to enforce authorization.
  # ---------------------------------------------------------------------------

  def can_query(params)     = true
  def can_access(objects)   = objects.map { true }
  def can_create(params)    = false
  def can_update(obj, prms) = false
  def can_destroy(obj)      = false

  # ---------------------------------------------------------------------------
  # Mutations
  # ---------------------------------------------------------------------------

  def create(params)
    model_class.create!(params)
  end

  def new(params)
    model_class.new(params)
  end

  def update(object, params)
    object.update!(params)
  end

  def destroy(object)
    object.destroy!
  end

  # Strong-params unwrapping for create. Override and call super, then .permit(…).
  #
  # Example:
  #   def create_params(params)
  #     super(params).permit(:name, :address)
  #   end
  #
  def create_params(params)
    params.require(model_class_name.underscore.to_sym)
  end

  # Defaults to create_params. Override if update permits different fields.
  def update_params(params)
    create_params(params)
  end

  # ---------------------------------------------------------------------------
  # Sideloading / expansion
  # ---------------------------------------------------------------------------

  # Return an Enumerable of additional objects to include in the response.
  # Returned objects are security-checked via their own Api class.
  def expound(objects)
    []
  end

  # Optional metadata hash returned alongside index query results.
  def query_metadata(query_results)
    nil
  end

  # Cache invalidation hints returned on create/update.
  # Format: { ModelClass => (:all | :queries | :records) }
  def invalidates(object)
    {}.freeze
  end

  # ---------------------------------------------------------------------------
  # Serialization
  # ---------------------------------------------------------------------------

  # Serializes a single object to a Hash for JSON output.
  # Default uses as_json. Override to customize the shape.
  #
  # Example:
  #   def serialize(device)
  #     { id: device.id, name: device.name, address: device.modbus_address }
  #   end
  #
  def serialize(object)
    object.as_json
  end

  # ---------------------------------------------------------------------------
  # Routing
  # ---------------------------------------------------------------------------

  # Constructs the URL path for a model instance (used in create Location header).
  # Override for polymorphic/STI models.
  def model_path(object)
    controller.send(:"#{model_class_name.underscore}_path", object)
  end

  # ---------------------------------------------------------------------------
  # Reflection helpers
  # ---------------------------------------------------------------------------

  def model_class
    @model_class ||= model_class_name.constantize
  end

  def model_class_name
    @model_class_name ||= self.class.name.match(/^\w+(?=Api$)/)[0]
  end
end
