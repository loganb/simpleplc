# Project Overview

## Purpose

HVAC PLC controller application — a web interface for monitoring and controlling HVAC programmable logic controllers over Modbus.

## Architecture

- **Backend**: Rails 8.1 in API-only mode, serving JSON via RestfulApiController + RestfulApi pattern.
- **Frontend**: Preact + TypeScript, bundled with esbuild, styled with Tailwind CSS v4. Lives in `frontend/`. Designed for static deployment (S3, GitHub Pages). Communicates with Rails via CORS.
- **Database**: SQLite3 (via the Solid stack — Solid Queue, Solid Cache, Solid Cable — no Redis needed).
- **Real-time**: ActionCable backed by Solid Cable for WebSocket support.
- **Deployment**: Docker + Kamal, with Thruster for HTTP caching/compression.
- **Tooling**: Ruby 4.0.2, Node 22, managed via mise.

## Current State

- **Modbus polling** working — three devices (DS18B20 temp board, NTC temp board, relay I/O board) polled and state stored in `devices.current_state` JSON column.
- **REST API** exposes devices, host_interfaces, measurements, and measurement_data with the RestfulApiController pattern (flat JSON wire format compatible with RestfulModelStore).
- **Measurements** — named values with a source device + JSON path (e.g. `temperatures[4]`), update period, optional units. `measurement_data` table stores timestamped float readings.
- **Frontend dashboard** shows device cards with live data + measurement cards with latest values + CRUD form for measurements.

## Key Entry Points

- `config/routes.rb` — resources for host_interfaces, devices, measurements, measurement_data.
- `app/apis/` — RestfulApi subclasses (DeviceApi, HostInterfaceApi, MeasurementApi, MeasurementDatumApi).
- `lib/restful_api_controller.rb` — controller mixin providing REST actions.
- `frontend/src/App.tsx` — main Preact dashboard component.
- `frontend/src/store.ts` — RestfulModelStore instance + model definitions.
- `frontend/src/lib/` — RestfulModelStore, DataLoader2, TreeStore, RateLimiter, MemoryStore (ported from BioTrack).
- `frontend/build.mjs` — esbuild config (dev server on port 5174, or static build to `public/`).

## Data Model

- `host_interfaces` — serial port config (port, baud, parity, etc.)
- `devices` — Modbus devices (belongs_to host_interface, driver, modbus_address, current_state JSON)
- `measurements` — named values (name, source_type, device_id, source_path, update_period, units)
- `measurement_data` — time-series readings (measurement_id, value float nullable, recorded_at)
