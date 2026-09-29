# Project Overview

## Purpose

HVAC PLC controller application — a web interface for monitoring and controlling HVAC programmable logic controllers over Modbus.

## Architecture

- **Backend**: Rails 8.1 in API-only mode, serving JSON via RestfulApiController + RestfulApi pattern.
- **Frontend**: Preact + TypeScript, bundled with esbuild, styled with Tailwind CSS v4. Lives in `frontend/`. Designed for static deployment (S3, GitHub Pages). Communicates with Rails via CORS.
  - Development Rails and esbuild servers bind to `0.0.0.0` for LAN/Tailscale testing; development CORS is permissive. Production CORS behavior is unchanged.
  - `frontend/public/` is the static template source (hand-written `index.html`, future favicons/manifests). Checked into git.
  - `frontend/dist/` is the build output (gitignored). `build.mjs` copies `public/` → `dist/` and writes `app.js`, `app.css`, `index.css` alongside.
  - Two CSS pipelines write into `dist/`: (1) the Tailwind CLI subprocess processes `src/index.css` → `dist/index.css`; (2) esbuild bundles `.css`/`.scss` imports from the TSX module graph (entry `src/widgets.scss` plus any component-colocated styles) → `dist/app.css`. SCSS handled by `esbuild-sass-plugin`. Tailwind's `@apply` is only available inside `src/index.css` — component SCSS uses Tailwind utility classes via `className` instead.
- **Database**: PostgreSQL 18 (installed via the PGDG apt repo on the Pi; a single instance serves both dev and prod, separated by database name). Production config keeps the Solid stack — Solid Queue, Solid Cache, Solid Cable — on separate PostgreSQL databases, so Redis is still not needed. Solid Queue runs in-Puma (`SOLID_QUEUE_IN_PUMA=true`) for background jobs. The record-update stream uses the primary database through the PostgreSQL Cable adapter; the old Solid Cable database is unused by this stream.
- **Real-time**: Action Cable at /cable uses the record_postgresql adapter (Rails PostgreSQL LISTEN/NOTIFY plus listener recovery). Opted-in model updates invalidate already-known frontend records. HTTP remains the request transport; periodic refresh still covers queries and derived/time/filesystem changes.
- **Deployment**: dev and production both run on the same Raspberry Pi (the actual HVAC controller hardware). Production runs from a `git worktree` at `/opt/plc_controller/current`, deployed via `bin/deploy`, and is supervised by native systemd (`plc_controller-web`, `plc_controller-poller`, grouped under `plc_controller.target`) — no Docker/Kamal. Puma serves the built frontend directly (same-origin, no nginx). Full design and rationale in `claude/deployment.md`.
- **Tooling**: Ruby 4.0.2, Node 22, managed via mise (same toolchain for dev and prod on the Pi).

## Current State

- **Modbus polling** working — three devices (DS18B20 temp board, NTC temp board, relay I/O board) polled and state stored in `devices.current_state` JSON column. The N4D8B08 relay I/O driver writes unrelated input/output relationship mode through explicit configure! during normal connection preparation so physical input highs do not toggle relay outputs.
- **Interface enable/online state** — `HostInterface` carries two independent states with two different writers. `enabled` is operator intent, set from the UI; `online` is the poller's report that it is holding the port open. The poller keeps one `ModBus::RTUClient` per interface open *across* cycles (`Poller::Connection`) instead of reopening every 10s, caching driver instances with it so a driver's setup writes — `Drivers::N4D8B08#configure!` writes the relationship register — happen once per connection rather than every cycle. Disabling is a request, not an act: the web process never touches the port, so the UI shows `releasing` until the poller confirms by writing `online: false`. `HostInterface#connection_state` folds intent, the report, and a `poller_reported_at` heartbeat into `online | offline | releasing | disabled | unknown`; staleness gates both directions so a dead poller can't leave a phantom online bus. Serial-level errors (`SystemCallError`/`IOError`) drop the connection and reconnect next cycle, while Modbus protocol errors stay device-level and keep the port. `SIGTERM` releases every port and marks its bus offline. See `claude/interface-online-state.md`.
- **REST API** exposes devices, host_interfaces, host_ports, measurements, logic diagrams/blocks, output blocks, and traces with the RestfulApiController pattern (flat JSON wire format compatible with RestfulModelStore).
- **Host port scanning** — `HostPortScanner` enumerates the machine's real serial ports from `/sys/class/tty` (keeping only ttys with a bound `device/driver`, which excludes ptys and virtual consoles), enriches them with USB descriptors and `/dev/serial` aliases, and flags kernel consoles from `/proc/consoles`. It performs filesystem reads only and never opens a port, so it is safe to run from the web process while the poller is transacting on a bus. Exposed read-only as `HostPort`, a plain `Data.define` value object rather than an AR model; every request re-scans. `HostPort#id` is `Base64.urlsafe_encode64(stable_path)`, so ids are URL-safe with no route constraints, and `HostPortApi#by_ids` looks ids up against a fresh scan rather than decoding them into paths. `HostInterface#port` should hold the most stable path available (`by_id || by_path || device`); `HostInterface` also gained a required `name` and computed `port_present` / `resolved_device` (named `port_present?` rather than `present?` so it does not shadow `Object#present?`). The Devices tab lists discovered ports and turns a selected one into a prefilled new-interface form. See `claude/host-port-scan.md`.
- **Measurements** — named values owned by LogicDiagrams. Drivers declare stable Device-level `inputs` and `outputs` catalogs; the Device API exposes both with per-Device label overrides merged over driver defaults, and the logic editor restricts acquisition measurement sources to the selected Device's enumerated inputs instead of accepting a free-form JSON path. Acquisition measurements read the selected path (e.g. `temperatures[4]`) at Trace creation; simulation measurements use an operator-entered value so diagrams can be designed before hardware is wired. Boolean acquisition values normalize to `1.0`/`0.0`; missing acquisition values remain `null`.
- **Frontend UX** is split into top-level Dashboard, Devices, and Logic tabs. `frontend/src/App.tsx` owns shared data loading and the root `TreeStore`; `frontend/src/uxTree.ts` defines typed subtrees passed into each tab. Dashboard is monitoring-only, showing device state plus per-logic-diagram input/output summaries. Devices owns host-interface and device CRUD; Device create/edit uses a modal with driver-catalog input/output label fields. Logic owns diagram, measurement, block, and output editing, with hardware selectors and cards showing effective Device labels while persisting stable paths/channels. Live queries refresh every 5 minutes and use bounded frontend store cache epochs to avoid unbounded long-session cache growth.
- **LogicDiagram feature** — a LogicDiagram maps diagram-owned Measurements through stateful LogicBlocks (initially hysteresis and latch) into OutputBlocks. The frontend editor computes topological strata for left-to-right block columns, while the backend validates dependency order and evaluates blocks by ascending stratum. Creating a Trace snapshots every Measurement, computes every LogicBlock, then evaluates OutputBlocks into the trace `results` JSON document. Expression runtime values are numbers, `true`, `false`, and `null`; booleans/numbers coerce at math/boolean operator boundaries, while ordinary operators propagate `null`. Hysteresis and latch blocks emit `null` when required inputs are unknown but preserve retained internal state for continuity. Latest UI state and output writing read from the newest Trace for the diagram. The poller owns physical relay writes: after reading a device, it applies the latest enabled non-null OutputBlock values for that device when both the diagram and output have `output_enable` true. Disabled outputs record desired state but leave hardware unchanged. The frontend can delete a selected diagram after browser confirmation; Rails cascades that delete to diagram-owned measurements, blocks, outputs, and traces. See `claude/logic-diagram.md`, `claude/measurements-in-logic-diagram-and-simulation.md`, `claude/output-enable.md`, `claude/trace-results-json.md`, `claude/expression-types.md`, and `claude/logic-diagram-delete.md`.
- **Logic runner** — a dedicated daemon computes each LogicDiagram on its `update_period`. It runs asynchronously from the poller and communicates only through Trace records; the poller remains the sole hardware writer. Missing intervals are not backfilled, per-diagram failures retry after ten seconds, and a PostgreSQL advisory lock prevents duplicate runners for one database. Foreman wiring and production systemd supervision are installed. Deployed as `99f43b7` on 2026-09-28 and verified across three consecutive 30-second production traces with healthy subsequent hardware polls. The current development Foreman session still needs a restart to add its new Procfile process. See `claude/logic-runner.md`.

## Key Entry Points

- `config/routes.rb` — resources for host_interfaces, devices, measurements, logic diagrams/blocks, output blocks, and traces.
- `app/apis/` — RestfulApi subclasses (DeviceApi, HostInterfaceApi, MeasurementApi, LogicDiagramApi, LogicBlockApi, OutputBlockApi, TraceApi).
- `lib/restful_api_controller.rb` — controller mixin providing REST actions.
- `frontend/src/App.tsx` — main Preact dashboard component.
- `frontend/src/store.ts` — RestfulModelStore instance + model definitions.
- **Frontend I/O rule:** all server I/O goes through RestfulModelStore, and the API has no actions — only create/patch (an "action" becomes a field mutation or a new record). Devices-tab legacy direct axios calls and verb endpoints (`scan`, `cancel_scan`, `preview`, `apply`, `impact`) are being migrated in two phases; see `claude/store-io-cleanup.md`.
- `frontend/src/lib/` — RestfulModelStore, DataLoader2, TreeStore, RateLimiter, MemoryStore (ported from BioTrack). RestfulModelStore has two-generation record/query caches; `query_version` is the separate per-model query invalidation counter.
- `frontend/build.mjs` — esbuild config + Tailwind CLI subprocess + `public/` → `dist/` copy. Dev server on port 5174 serving `dist/`; static build writes to `dist/`.

## Data Model

- `host_interfaces` — serial bus config (name, port, baud, parity, etc.) plus `enabled` (operator intent, written by the web process) and `online`/`poller_reported_at`/`connection_error` (the poller's report, never writable through the API). `port` should be a stable path — prefer `/dev/serial/by-id/...` over `/dev/ttyUSB0`, which is assigned in enumeration order and can move between adapters across reboots.
- `devices` — Modbus devices (belongs_to host_interface, driver, modbus_address, current_state JSON, and JSONB input/output label overrides)
- `measurements` — LogicDiagram-owned named values (name, mode, optional device/source path, units, simulation value)
- `logic_diagrams` — named control-logic diagrams with an update period
- `logic_blocks` — diagram-owned stateful/function blocks with expression inputs, config, state, and frontend-computed stratum
- `output_blocks` — diagram-owned binary output commands with an input expression, device/channel destination, and per-output enable gate
- `traces` — explicit computation runs for a LogicDiagram, with `results` JSON storing schema-versioned measurement, logic block, and output block result buckets keyed by source ID.

## WebSocket record updates

- Implemented initial stream; see `claude/websocket-store.md` for architecture, verification and follow-ups. Scope is updates to already-known records. Queries, new-record discovery, deletion streams, dependency-derived notifications, WebSocket requests and Bloom filters remain deferred.
- Models opt in through `ObservesRecordChanges`; the seven application models currently opt in. Notifications execute synchronously inside the writer transaction. The `record_postgresql` Cable adapter uses the application database and extends Rails' PostgreSQL listener with reconnect/resync signalling.
- `ApplicationCable::Connection` accepts an optional `config.x.record_authenticator`; current connections are anonymous. Streaming processes filter notifications through per-API `record_scope(principal)` and exact client interests. Scopes currently allow all records; account authentication and revocation remain future work.
- `RecordStream` opens with App mount, subscribes both cache generations, reconciles after acknowledged interest changes/reconnect and stops on unmount. `RestfulModelStore` rejects stale versions, handles request races and deduplicates refetches while retaining cached values. The UI shows connection status; existing periodic/manual refresh remains.
- Validation: 161 RSpec examples, 26 frontend tests, TypeScript check and build passed. Two real Cable clients refreshed after a separate writer's commit (about 121 ms in a smoke run). PostgreSQL listener interruption/recovery is covered. Chromium navigation stalled in the local test harness, so browser rendering was not verified.
- Restart Foreman API/poller for the new adapter and observers; ensure frontend dependencies are installed. No migration or production deployment for this slice. `/cable` is same-origin by default; additional trusted origins use `PLC_CABLE_ORIGINS`.

## Completed record-locking prerequisite

- Committed as `88da3cb`; all seven application tables have `lock_version` (integer, default 0, non-null). Runtime poller writes use validated Active Record saves with normal timestamps and callbacks. Bounded persistence retries preserve operator edits without repeating hardware IO.
- API records expose versions; request-time stale writes return 409. The store does not equate row-version equality with representation equality. Offline SQLite restoration remains an explicit bypass.
- Test and development schemas migrated; Foreman processes need schema reload after migration. Verification: 149 RSpec examples and 16 frontend tests passed; frontend build passed. See `claude/lock-version.md`.

## Latest production verification — 2026-09-26

Commit `5e9df7b` is deployed, including locking migrations and the record stream. Web health checks passed. Production bus configuration still uses missing `/dev/cu.usbserial-D30E7F3F`; the connected FTDI adapter is serial `D30I8SGW` at `/dev/ttyUSB0`. Read-only 9600 8N1 scanning found only address 1, with register responses consistent with the relay I/O board (not definitive identification). Configured temperature devices at addresses 1 and 2 and relay at 3 do not match this observed bus. Configuration was not changed. See `claude/deployment.md` for results.

## Production hardware configuration corrected — 2026-09-26

Using only the UX HTTP API, repaired interface 1 as `RS-485 Relay Bus` on FTDI serial `D30I8SGW` using its stable by-id path, 9600 8N1. Removed absent temperature device records 1 and 2; relay record 3 now uses address 1 with Drivers::N4D8B08. Two successful polling cycles verified; interface online, no device/connection errors, all eight inputs and outputs false. No measurements, outputs, or diagrams depended on deleted records. This supersedes the mismatched-configuration observation above. See `claude/hardware-setup.md` for operations and API/UX gaps awaiting design.

## Hardware setup UX — implemented locally

The approved hardware-setup plan is implemented; see `claude/hardware-setup.md` for API design and validation. A disabled HostInterface holds one scan state machine, request token, options, JSON results and cancellation state. The poller executes the whole read-only scan synchronously; other interfaces wait. Per-interface threading remains future work.

Driver constructors have no hardware IO. The poller calls configure! before caching a normal-operation driver; scans never configure devices. Each driver implements device_support (yes/no/maybe plus evidence). The UX lists all verdicts and lets the operator choose and match a driver before applying configuration.

Devices supports port replacement, scan/cancel, reviewed atomic configuration changes, dependency-aware deletion, structured errors/conflict recovery and two-fresh-poll verification after enable. Configuration revisions protect operator edits independently of heartbeat/scan updates. Shared serial locks and unique adapter claims prevent cooperating processes or aliases from owning the same bus. Stale connection-error text still clears on the next poll.

Validation: 181 RSpec examples and 33 frontend tests pass; TypeScript and frontend build pass. Includes an API/poller journey against a fake RTU endpoint and Preact component tests. Real Chromium smoke checking timed out; visual browser verification remains unconfirmed. Development/test databases migrated; restart development API/poller to load the schema/code. Production is unchanged, and implementation changes remain uncommitted and undeployed.


### Hardware setup production deployment — 2026-09-26

The previously local hardware setup implementation is now deployed at 894cdcf, following explicit user approval. Production migration/build succeeded, both services are active, and API checks confirm fresh successful relay polling. See hardware-setup.md for implementation and validation details.

### Enumerated measurement inputs production deployment — 2026-09-28

Device input/output catalogs and the measurement source selector are deployed at
`08d67c2`. Production web and poller services are active, HTTP health checks
pass, and both relay boards resumed fresh successful polling without errors.

## Device I/O labels — implemented locally

Device create/edit now opens in an accessible modal and exposes label overrides
for every driver-declared input and output. Overrides live in one `io_labels`
JSONB column; API catalogs merge them over driver defaults. LogicDiagram forms
and cards display effective labels while Measurements and OutputBlocks continue
to persist stable paths and numeric channels. Label-only edits do not advance the
parent bus revision or touch hardware. Development and production are migrated;
production is deployed at `cf38150`, with all services healthy and both relay
boards polling cleanly after restart. See `claude/device-io-labels.md` for design
and verification.
