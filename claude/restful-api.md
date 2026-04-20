# RESTful API Pattern

## Overview

This project uses a two-layer pattern for Rails API controllers:

```
FoosController  (includes RestfulApiController)
      ↓
  FooApi        (extends RestfulApi)
      ↓
  Foo model
```

The controller handles HTTP mechanics. The API class handles all domain logic: fetching, access control, serialization, and sideloading. This keeps controllers trivially thin.

## Files

| File | Purpose |
|------|---------|
| `lib/restful_api_controller.rb` | Controller mixin — CRUD actions, response rendering |
| `app/apis/restful_api.rb` | Base API class — override methods to implement behavior |
| `app/apis/<name>_api.rb` | Per-resource API implementations |

## Creating a New Resource

### 1. Controller

Controllers are almost always one line:

```ruby
class DevicesController < ApplicationController
  include RestfulApiController
end
```

### 2. API Class

Create `app/apis/device_api.rb`:

```ruby
class DeviceApi < RestfulApi
  def by_query(params)
    Device.all.order(:modbus_address)
  end

  def can_create(params) = true
  def can_update(obj, _) = true
  def can_destroy(obj)   = true

  def create_params(params)
    params.require(:device).permit(:name, :modbus_address, :device_type)
  end

  def serialize(device)
    {
      id:             device.id,
      name:           device.name,
      modbus_address: device.modbus_address,
      device_type:    device.device_type
    }
  end
end
```

### 3. Routes

Standard Rails resources:

```ruby
resources :devices
```

## API Methods to Override

### Fetching

| Method | Default | Override when |
|--------|---------|---------------|
| `by_query(params)` | raises NotImplementedError | always — define what `index` returns |
| `by_ids(ids)` | `where(id: ids)` | using non-integer PKs or polymorphic IDs |
| `canonicalize_ids(ids)` | `.to_i` on each | IDs aren't integers |

### Access Control

All default to permissive for reads, restrictive for writes. Override as needed.

| Method | Default |
|--------|---------|
| `can_query(params)` | `true` |
| `can_access(objects)` | `[true, true, …]` |
| `can_create(params)` | `false` |
| `can_update(obj, params)` | `false` |
| `can_destroy(obj)` | `false` |

### Params

| Method | Default |
|--------|---------|
| `create_params(params)` | `params.require(:model_name)` — no fields permitted |
| `update_params(params)` | delegates to `create_params` |

Always override `create_params` to call `super.permit(…)`:

```ruby
def create_params(params)
  super(params).permit(:name, :address)
end
```

### Serialization

`serialize(object)` defaults to `object.as_json`. Override to control the exact shape:

```ruby
def serialize(reading)
  { id: reading.id, value: reading.value, recorded_at: reading.recorded_at.iso8601 }
end
```

### Sideloading

`expound(objects)` returns additional related objects to include in the response. They are automatically security-checked via their own Api class.

```ruby
def expound(devices)
  Reading.where(device: devices).recent
end
```

### Metadata & Invalidation

```ruby
def query_metadata(results)
  { total: results.count }
end

def invalidates(object)
  { Reading => :queries }
end
```

## Response Format

All responses use the same envelope:

```json
{
  "objects": {
    "Device":  [{ "id": 1, … }, { "id": 2, … }],
    "Reading": [{ "id": 10, … }]
  },
  "metadata":   { … },
  "invalidates": { … }
}
```

- `objects` — primary resource and any expounded sideloads, grouped by class name
- `metadata` — optional, from `query_metadata`
- `invalidates` — optional, on create/update responses

Create responses additionally include `"object"` (singular) with the newly created record.

## Query Parameter

`index` accepts a `q` param containing a JSON object:

```
GET /devices?q={"device_type":"temperature"}
```

This is merged into params and passed to `by_query`.

## Naming Convention

| Resource | Controller | API Class |
|----------|-----------|-----------|
| `Device` | `DevicesController` | `DeviceApi` |
| `Reading` | `ReadingsController` | `ReadingApi` |

The controller discovers its API class by stripping `Controller`, singularizing, and appending `Api`.
