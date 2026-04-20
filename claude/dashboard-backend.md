# Dashboard Backend — Design & Implementation Plan

## Overview

A polling daemon collects device state every N seconds and writes it to the database. A REST API exposes devices including their latest state.

---

## 1. Database

### Migration: add `current_state` to `devices`

```ruby
add_column :devices, :current_state, :json
add_column :devices, :last_polled_at, :datetime
add_column :devices, :poll_error, :string   # nil = healthy, message = last error
```

### `current_state` JSON schema

Written by the driver's `read` method, wrapped in a standard envelope:

```json
{
  "polled_at": "2026-04-19T12:00:00Z",
  "status":    "ok",              // or "error"
  "error":     null,              // error message string if status=error
  "data":      { … }             // raw driver output, driver-specific
}
```

Driver-specific `data` shapes:

- **N4DSC08 / NT48C32**: `{ "temperatures": [22.9, null, null, …] }`
- **N4D8B08**: `{ "outputs": [false, …], "inputs": [false, …] }`

---

## 2. Polling Daemon

### Process model

A standalone loop process run alongside Rails in `Procfile.dev`:

```
poller: bundle exec rails runner lib/poller.rb
```

This is simpler than a Solid Queue recurring job (no scheduler overhead, no job table churn at 1Hz) and gives us direct control over the loop timing and connection lifecycle.

### Connection management

Devices share a serial port via `HostInterface`. We must not open multiple RTU connections to the same port simultaneously. The poller:

1. Loads all `HostInterface` records with their `devices`
2. For each `HostInterface`, opens **one** `RTUClient` for the whole poll cycle
3. Iterates devices on that interface, calls `device.driver_instance(slave).read`
4. Writes result back to the device record
5. Closes the client, sleeps, repeats

### Error handling

Per-device errors (timeout, modbus exception) are caught individually — one bad device doesn't abort the others. The error is written into `current_state` with `status: "error"`.

Interface-level errors (can't open serial port) are logged and the whole interface is skipped for that cycle.

### Pseudocode

```ruby
POLL_INTERVAL = 1  # seconds

loop do
  cycle_start = Time.now

  HostInterface.includes(:devices).each do |iface|
    ModBus::RTUClient.connect(iface.port, iface.baud_rate) do |client|
      client.read_retry_timeout = 0.5
      client.read_retries = 1

      iface.devices.each do |device|
        begin
          slave  = client.with_slave(device.modbus_address)
          data   = device.driver_instance(slave).read
          state  = { polled_at: Time.now.utc.iso8601, status: "ok", error: nil, data: data }
        rescue => e
          state  = { polled_at: Time.now.utc.iso8601, status: "error", error: e.message, data: nil }
        end
        device.update_columns(current_state: state, last_polled_at: Time.now)
      end
    end
  rescue => e
    Rails.logger.error "Poller: failed to connect to #{iface.port}: #{e.message}"
  end

  elapsed = Time.now - cycle_start
  sleep [POLL_INTERVAL - elapsed, 0].max
end
```

---

## 3. REST API

### Routes

```ruby
resources :devices
resources :host_interfaces
```

### DeviceApi

`by_query` returns all devices (or scoped by host_interface_id if param present).
`serialize` includes `current_state` and `last_polled_at`.

### Response shape (GET /devices or GET /devices/:id)

```json
{
  "objects": {
    "Device": [
      {
        "id": 1,
        "name": "DS18B20 Board",
        "modbus_address": 1,
        "driver": "Drivers::N4DSC08",
        "host_interface_id": 1,
        "last_polled_at": "2026-04-19T12:00:00Z",
        "current_state": {
          "polled_at": "2026-04-19T12:00:00Z",
          "status": "ok",
          "error": null,
          "data": { "temperatures": [22.9, null, null, null, null, null, null, null] }
        }
      }
    ]
  }
}
```

---

## 4. Implementation Plan

1. Migration: add `current_state`, `last_polled_at`, `poll_error` to `devices`
2. `lib/poller.rb` — polling loop
3. Update `Procfile.dev` to run the poller
4. `app/apis/device_api.rb` — `by_query`, `serialize`
5. `app/controllers/devices_controller.rb` — one-liner
6. Add route `resources :devices`
7. Smoke test: seed a HostInterface + Device, run poller, hit API
