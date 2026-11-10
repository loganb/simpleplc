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

Index responses use flat resource arrays and an ordered list of primary IDs:

```json
{
  "query": [1, 2],
  "devices": [{ "id": 1 }, { "id": 2 }],
  "host_interfaces": [{ "id": 10 }],
  "metadata": { "total": 2 }
}
```

- Resource keys are plural underscored API names; additional arrays contain
  expounded records. There is no `objects` wrapper.
- `query` contains primary result IDs only, in query order, including an empty
  array for an empty result. The client resolves those IDs through its record
  cache and exposes `metadata` on the query result.
- Show/update return the same flat resource arrays without `query`. Create
  additionally returns the new record's `id` at the top level.
- Create/update may include `invalidates`, keyed by singular underscored model
  names with values `all`, `queries` or `records`.
- Optimistically locked records include `lock_version` automatically.
- Client record identity is model + ID, independent of query arguments.
  Computed resources must give distinct logical records distinct IDs and
  implement `canonicalize_ids`/`by_ids` for show. They may use plain Ruby
  value objects rather than database tables; see HostPort.

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
