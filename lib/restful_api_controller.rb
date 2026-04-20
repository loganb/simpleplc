#
# Mix into a controller to get a standard RESTful API implementation.
#
# Delegates all query, access-control, and serialization logic to a
# companion API class named <ModelName>Api (see RestfulApi).
#
# Response format:
#
#   {
#     "objects": {
#       "ClassName":  [ { …serialized… }, … ],
#       "OtherClass": [ … ]
#     },
#     "metadata":   { … },   // optional, from api_instance.query_metadata
#     "invalidates": { … }   // optional, on mutating responses
#   }
#
# For create, the root key is "object" (singular) for the primary resource,
# alongside the "objects" sidecar for expounded records.
#
module RestfulApiController
  extend ActiveSupport::Concern

  class ForbiddenError < StandardError; end
  class BadRequest < StandardError; end
  class UnprocessableEntityError < StandardError; end

  included do
    rescue_from ForbiddenError do
      render json: {}, status: :forbidden
    end
    rescue_from UnprocessableEntityError do |e|
      render json: { error: e.message }, status: :unprocessable_entity
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
    api_instances[clazz.respond_to?(:api_class_name) ? clazz.api_class_name : clazz.name]
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

    response_json = { objects: serialize_by_class(objects.concat(expounded)) }
    response_json[:metadata] = metadata if metadata
    render json: response_json
  end

  # GET /resources/:id
  def show
    ids             = api_instance.canonicalize_ids([params[:id]])
    fetched_objects = api_instance.by_ids(ids)
    raise ActiveRecord::RecordNotFound if fetched_objects.all?(&:nil?)

    permissions = api_instance.can_access(fetched_objects).to_a
    raise ForbiddenError if permissions.all?(false)

    objects   = fetched_objects.select.each_with_index { |_o, i| permissions[i] }
    expounded = expounded_objects_for(objects)

    render json: { objects: serialize_by_class(objects.concat(expounded)) }
  end

  # POST /resources
  def create
    request_params = api_instance.create_params(params)
    raise ForbiddenError unless api_instance.can_create(request_params)

    object    = api_instance.create(request_params)
    expounded = expounded_objects_for([object])

    response_json = {
      object:     api_instance.serialize(object),
      objects:    serialize_by_class(expounded + [object]),
      invalidates: api_instance.invalidates(object)
    }
    render json: response_json, status: :created
  end

  # GET /resources/new?json=<json>   (preview / validation)
  def new
    request_params = api_instance.create_params(
      ActionController::Parameters.new(JSON.parse(params[:json]))
    )
    raise ForbiddenError unless api_instance.can_create(request_params)

    object    = api_instance.new(request_params)
    expounded = expounded_objects_for([object])

    render json: {
      object:  api_instance.serialize(object),
      objects: serialize_by_class(expounded)
    }
  end

  # PATCH/PUT /resources/:id
  def update
    object = api_instance.by_ids(api_instance.canonicalize_ids([params[:id]]))[0]
    raise ActiveRecord::RecordNotFound unless object

    request_params = api_instance.update_params(params)
    raise ForbiddenError unless api_instance.can_update(object, request_params)

    api_instance.update(object, request_params)
    expounded = expounded_objects_for([object])

    render json: {
      objects:    serialize_by_class([object].concat(expounded)),
      invalidates: api_instance.invalidates(object)
    }
  end

  # DELETE /resources/:id
  def destroy
    object = api_instance.by_ids(api_instance.canonicalize_ids([params[:id]]))[0]
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

  # Groups objects by class name and serializes each using the appropriate API instance.
  # Returns a hash like: { "Device" => [{…}, …], "Reading" => [{…}, …] }
  def serialize_by_class(objects)
    objects
      .group_by { |o| o.class.respond_to?(:api_class_name) ? o.class.api_class_name : o.class.name }
      .transform_values do |group|
        inst = api_instance_for(group.first.class)
        group.map { |o| inst.serialize(o) }
      end
  end
end
