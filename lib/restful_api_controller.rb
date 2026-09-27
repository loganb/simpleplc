#
# Mix into a controller to get a standard RESTful API implementation.
#
# Delegates all query, access-control, and serialization logic to a
# companion API class named <ModelName>Api (see RestfulApi).
#
# Response format (compatible with RestfulModelStore client):
#
#   Index:
#   {
#     "query":      [id1, id2, …],
#     "devices":    [ { …serialized… }, … ],
#     "host_interfaces": [ … ],
#     "metadata":   { … }
#   }
#
#   Show / Update:
#   {
#     "devices":    [ { …serialized… } ],
#     "host_interfaces": [ … ],
#     "invalidates": { … }
#   }
#
#   Create:
#   {
#     "id":         123,
#     "devices":    [ { …serialized… } ],
#     "invalidates": { … }
#   }
#
module RestfulApiController
  extend ActiveSupport::Concern

  class ForbiddenError < StandardError; end
  class BadRequest < StandardError; end
  class UnprocessableEntityError < StandardError; end

  included do
    rescue_from HardwareError do |e|
      render json: { code: e.code, message: e.message, errors: { base: [ e.message ] }, details: e.details }, status: e.status
    end
    rescue_from ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed, ActiveRecord::RecordNotSaved do |e|
      render json: { code: "validation", message: e.message, errors: e.record.errors.to_hash }, status: :unprocessable_entity
    end
    rescue_from ActiveRecord::InvalidForeignKey, ActiveRecord::RecordNotUnique do
      render json: { code: "conflict", errors: { base: [ "Configuration or dependencies changed; reload and review" ] } }, status: :conflict
    end
    rescue_from ActionController::ParameterMissing do |e|
      render json: { errors: { base: [ e.message ] } }, status: :unprocessable_entity
    end
    rescue_from ForbiddenError do
      render json: {}, status: :forbidden
    end
    rescue_from UnprocessableEntityError do |e|
      render json: { error: e.message }, status: :unprocessable_entity
    end
    rescue_from ActiveRecord::StaleObjectError do
      render json: { errors: { base: [ "Record changed concurrently; reload and try again" ] } }, status: :conflict
    end
    rescue_from ActiveRecord::RecordNotFound do
      render json: {}, status: :not_found
    end
  end

  # Maps "ModelClassName" → instance of ModelClassNameApi.
  # Lazily constructed per request.
  attr_reader :api_instances

  def initialize(*args)
    super(*args)
    @api_instances = Hash.new do |h, k|
      h[k] = "#{k}Api".constantize.new(self)
    end
  end

  # Returns the API instance that corresponds to this controller.
  # E.g. DevicesController → DeviceApi
  def api_instance
    @api_class_name ||= self.class.name.match(/^\w+(?=Controller$)/).to_s.singularize
    api_instances[@api_class_name]
  end

  # Returns the API instance for an arbitrary model class.
  def api_instance_for(clazz)
    api_instances[RecordResources.api_class_name(clazz)]
  end

  # GET /resources?q=<json>
  def index
    query = params.merge(JSON.parse(params[:q] || "{}"))
    raise ForbiddenError unless api_instance.can_query(query)

    objects     = api_instance.by_query(query).to_a
    metadata    = api_instance.query_metadata(objects)
    permissions = api_instance.can_access(objects).to_a
    objects     = objects.select.each_with_index { |_o, i| permissions[i] }

    expounded = expounded_objects_for(objects)

    response_json = serialize_flat(objects + expounded)
    response_json[:query] = objects.map(&:id)
    response_json[:metadata] = metadata if metadata
    render json: response_json
  end

  # GET /resources/:id
  def show
    ids             = api_instance.canonicalize_ids([ params[:id] ])
    fetched_objects = api_instance.by_ids(ids)
    raise ActiveRecord::RecordNotFound if fetched_objects.all?(&:nil?)

    permissions = api_instance.can_access(fetched_objects).to_a
    raise ForbiddenError if permissions.all?(false)

    objects   = fetched_objects.select.each_with_index { |_o, i| permissions[i] }
    expounded = expounded_objects_for(objects)

    render json: serialize_flat(objects.concat(expounded))
  end

  # POST /resources
  def create
    request_params = api_instance.create_params(params)
    raise ForbiddenError unless api_instance.can_create(request_params)

    object    = api_instance.create(request_params)
    expounded = expounded_objects_for([ object ])

    response_json = serialize_flat(expounded + [ object ])
    response_json[:id] = object.id
    response_json[:invalidates] = api_instance.invalidates(object)
    render json: response_json, status: :created
  end

  # GET /resources/new?json=<json>   (preview / validation)
  def new
    request_params = api_instance.create_params(
      ActionController::Parameters.new(JSON.parse(params[:json]))
    )
    raise ForbiddenError unless api_instance.can_create(request_params)

    object    = api_instance.new(request_params)
    expounded = expounded_objects_for([ object ])

    response_json = serialize_flat(expounded)
    response_json[:data] = api_instance.serialize(object)
    render json: response_json
  end

  # PATCH/PUT /resources/:id
  def update
    object = api_instance.by_ids(api_instance.canonicalize_ids([ params[:id] ]))[0]
    raise ActiveRecord::RecordNotFound unless object

    request_params = api_instance.update_params(params)
    raise ForbiddenError unless api_instance.can_update(object, request_params)

    api_instance.update(object, request_params)
    expounded = expounded_objects_for([ object ])

    response_json = serialize_flat([ object ].concat(expounded))
    response_json[:invalidates] = api_instance.invalidates(object)
    render json: response_json
  end

  # DELETE /resources/:id
  def destroy
    object = api_instance.by_ids(api_instance.canonicalize_ids([ params[:id] ]))[0]
    raise ActiveRecord::RecordNotFound unless object
    raise ForbiddenError unless api_instance.can_destroy(object)

    api_instance.destroy(object)
    head :no_content
  end

  private

  # Returns expounded objects for the given primary objects, with access-checking applied.
  def expounded_objects_for(fetched_objects)
    api_instance.expound(fetched_objects)
      .group_by { |o| o.class.name }
      .transform_values do |objects|
        perms = api_instance_for(objects.first.class).can_access(objects)
        objects.select.each_with_index { |_o, i| perms[i] }
      end
      .values
      .reduce([]) { |memo, class_objs| memo.concat(class_objs) }
  end

  # Groups objects by pluralized underscore class name and serializes each.
  # Returns a flat hash like: { "devices" => [{…}, …], "host_interfaces" => [{…}, …] }
  def serialize_flat(objects)
    objects
      .group_by { |o| api_class_name_for(o.class) }
      .transform_keys { |name| name.underscore.pluralize.to_sym }
      .transform_values do |group|
        inst = api_instance_for(group.first.class)
        group.map do |object|
          serialized = inst.serialize(object)
          object.is_a?(ApplicationRecord) ? serialized.merge(lock_version: object.lock_version) : serialized
        end
      end
  end

  # Returns the API-facing class name for a model class.
  # Supports STI via an optional .api_class_name class method.
  def api_class_name_for(clazz)
    RecordResources.api_class_name(clazz)
  end
end
