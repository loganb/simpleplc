# Project Overview

## Purpose

HVAC PLC controller application — a web interface for monitoring and controlling HVAC programmable logic controllers over Modbus.

## Architecture

- **Backend**: Rails 8.1 in API-only mode, serving JSON via RestfulApiController + RestfulApi pattern.
- **Frontend**: Preact + TypeScript, bundled with esbuild, styled with Tailwind CSS v4. Lives in `frontend/`. Designed for static deployment (S3, GitHub Pages). Communicates with Rails via CORS.
  - `frontend/public/` is the static template source (hand-written `index.html`, future favicons/manifests). Checked into git.
  - `frontend/dist/` is the build output (gitignored). `build.mjs` copies `public/` → `dist/` and writes `app.js`, `app.css`, `index.css` alongside.
  - Two CSS pipelines write into `dist/`: (1) the Tailwind CLI subprocess processes `src/index.css` → `dist/index.css`; (2) esbuild bundles `.css`/`.scss` imports from the TSX module graph (entry `src/widgets.scss` plus any component-colocated styles) → `dist/app.css`. SCSS handled by `esbuild-sass-plugin`. Tailwind's `@apply` is only available inside `src/index.css` — component SCSS uses Tailwind utility classes via `className` instead.
- **Database**: SQLite3 (via the Solid stack — Solid Queue, Solid Cache, Solid Cable — no Redis needed).
- **Real-time**: ActionCable backed by Solid Cable for WebSocket support.
- **Deployment**: Docker + Kamal, with Thruster for HTTP caching/compression.
- **Tooling**: Ruby 4.0.2, Node 22, managed via mise.

## Current State

- **Modbus polling** working — three devices (DS18B20 temp board, NTC temp board, relay I/O board) polled and state stored in `devices.current_state` JSON column.
- **REST API** exposes devices, host_interfaces, measurements, and measurement_data with the RestfulApiController pattern (flat JSON wire format compatible with RestfulModelStore).
- **Measurements** — named values with a source device + JSON path (e.g. `temperatures[4]`), update period, optional units. `measurement_data` table stores timestamped float readings.
- **Frontend dashboard** shows device cards with live data + measurement cards with latest values + CRUD form for measurements. It refreshes live queries every 5 minutes and uses bounded frontend store cache epochs to avoid unbounded long-session cache growth.
- **Planned LogicDiagram feature** — a LogicDiagram will map global Measurements through stateful LogicBlocks (initially hysteresis and latch) and eventually Outputs. The frontend editor will compute topological strata for left-to-right columns, while the backend should validate dependency order and evaluate blocks by ascending stratum. Outputs are visual-only for the first pass. Each LogicBlock computation should create a Datum row with output value, retained state, and computed input expression values for later graphing/debugging. See `claude/logic-diagram.md`.

## Key Entry Points

- `config/routes.rb` — resources for host_interfaces, devices, measurements, measurement_data.
- `app/apis/` — RestfulApi subclasses (DeviceApi, HostInterfaceApi, MeasurementApi, MeasurementDatumApi).
- `lib/restful_api_controller.rb` — controller mixin providing REST actions.
- `frontend/src/App.tsx` — main Preact dashboard component.
- `frontend/src/store.ts` — RestfulModelStore instance + model definitions.
- `frontend/src/lib/` — RestfulModelStore, DataLoader2, TreeStore, RateLimiter, MemoryStore (ported from BioTrack). RestfulModelStore has two-generation record/query caches; `query_version` is the separate per-model query invalidation counter.
- `frontend/build.mjs` — esbuild config + Tailwind CLI subprocess + `public/` → `dist/` copy. Dev server on port 5174 serving `dist/`; static build writes to `dist/`.

## Data Model

- `host_interfaces` — serial port config (port, baud, parity, etc.)
- `devices` — Modbus devices (belongs_to host_interface, driver, modbus_address, current_state JSON)
- `measurements` — named values (name, source_type, device_id, source_path, update_period, units)
- `measurement_data` — time-series readings (measurement_id, value float nullable, recorded_at)
- planned `logic_diagrams` — named control-logic diagrams
- planned `logic_blocks` — diagram-owned stateful/function blocks with expression inputs, config, state, and frontend-computed stratum
- planned `data`/`datum` — polymorphic historical computations containing output value, retained state JSON, and input expression result JSON. Initial source type is LogicBlock; later sources may include Measurements and Outputs.
