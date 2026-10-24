# Project Overview

## Purpose

HVAC PLC controller application — a web interface for monitoring and controlling HVAC programmable logic controllers over Modbus.

## Architecture

- **Backend**: Rails 8.1 in API-only mode, serving JSON via RestfulApiController + RestfulApi pattern.
- **Frontend**: Preact + TypeScript, bundled with esbuild, styled with Tailwind CSS v4. Lives in `frontend/`. Designed for static deployment (S3, GitHub Pages). Communicates with Rails via CORS.
  - Development Rails and esbuild servers bind for LAN/Tailscale testing;
    development CORS is permissive. The frontend derives API/Cable URLs from
    its page hostname on port 3000, while `PLC_DEV_HOST` narrowly authorizes the
    configured MagicDNS host in Rails and Action Cable. Production behavior is
    unchanged.
  - `frontend/public/` is the static template source (hand-written `index.html`, future favicons/manifests). Checked into git.
  - `frontend/dist/` is the build output (gitignored). `build.mjs` copies `public/` → `dist/` and writes `app.js`, `app.css`, `index.css` alongside.
  - Two CSS pipelines write into `dist/`: (1) the Tailwind CLI subprocess processes `src/index.css` → `dist/index.css`; (2) esbuild bundles `.css`/`.scss` imports from the TSX module graph (entry `src/widgets.scss` plus any component-colocated styles) → `dist/app.css`. SCSS handled by `esbuild-sass-plugin`. Tailwind's `@apply` is only available inside `src/index.css` — component SCSS uses Tailwind utility classes via `className` instead.
- **Database**: PostgreSQL 18 (installed via the PGDG apt repo on the Pi; a single instance serves both dev and prod, separated by database name). Production config keeps the Solid stack — Solid Queue, Solid Cache, Solid Cable — on separate PostgreSQL databases, so Redis is still not needed. Solid Queue runs in-Puma (`SOLID_QUEUE_IN_PUMA=true`) for background jobs. The record-update stream uses the primary database through the PostgreSQL Cable adapter; the old Solid Cable database is unused by this stream.
- **Real-time**: Action Cable at /cable uses the record_postgresql adapter (Rails PostgreSQL LISTEN/NOTIFY plus listener recovery). Opted-in model updates invalidate already-known frontend records. HTTP remains the request transport; periodic refresh still covers queries and derived/time/filesystem changes.
- **Deployment**: dev and production both run on the same Raspberry Pi (the actual HVAC controller hardware). Production runs from a `git worktree` at `/opt/plc_controller/current`, deployed via `bin/deploy`, and is supervised by native systemd (`plc_controller-web`, `plc_controller-poller`, grouped under `plc_controller.target`) — no Docker/Kamal. Puma serves the built frontend directly (same-origin, no nginx). Full design and rationale in `claude/deployment.md`.
- **Tooling**: Ruby 4.0.2, Node 22, managed via mise (same toolchain for dev and prod on the Pi).

## Current State

- **Logic diagram instances — deployed at `c0bd734`**: LogicDiagrams are reusable,
  hardware-independent definitions with typed inputs, blocks, and outputs.
  Top-level Instances bind those ports to fixed values or Device I/O and own
  schedules, traces, retained runtime state, and both output-enable gates.
  Navigation is Dashboard, Instances, Logic, Devices. Instance edits save live;
  incomplete instances evaluate safely, and one physical output has at most
  one active owner while inactive instances may retain overlapping standby
  bindings. See `claude/logic-diagram-instances.md`.

- **Poller cadence** — `POLL_INTERVAL` is 1 s. Serial IO happens outside any DB transaction; device observations and interface `report_connection` reports are buffered during the cycle and persisted together at its end in one async-commit transaction, one savepoint per record (a stale/invalid record is logged and skipped). Relay outputs are written only when the device's read-back differs from the desired state (unknown read-back counts as different). Cycle times are debug-logged, a cycle over `POLL_INTERVAL` logs a warning, and every 60 cycles an info summary (average/max) is logged. Already-cleanly-offline disabled buses are no longer re-reported every cycle. The production 24 h SD-card write baseline and cycle-time measurement from the plan have not been done; do them on the Pi before deploying.
- **Interface update period — deployed at `26f4dea`** — Each host interface has a configurable 1–300 second period, defaulting to 10 seconds for existing and new rows. The poller retains its one-second control loop for scans, disable requests, and connection reports, while device reads and output writes run when each interface is due. A period edit takes effect immediately without reopening the port; a reconnect polls immediately. Dashboard sample freshness scales with the configured period. See `claude/interface-refresh-period.md`.
- **Modbus polling** working — three devices (DS18B20 temp board, NTC temp board, relay I/O board) polled and state stored in `devices.current_state` JSON column. The N4D8B08 relay I/O driver writes unrelated input/output relationship mode through explicit configure! during normal connection preparation so physical input highs do not toggle relay outputs.
- **WJ150 pulse counter and driver settings** — `Drivers::WJ150` reads two independent pulse counters (`counts[n]`, `frequencies[n]`) from a WAYJUN WJ150 in two-counter mode; scaling pulses to flow is left to logic expressions. Drivers can declare a `settings_schema`; the operator's desired values live in `devices.settings` (absent key = unmanaged) and the driver reconciles them in `configure!`, writing only registers that differ. `Poller::Connection`'s driver cache fingerprint includes settings, so edits apply on the next scheduled hardware pass without disabling the bus. Address changes need a power cycle: the driver programs the register, the device goes offline, and after the power cycle the poller asks `Driver#relocated_address`, commits the new `modbus_address` and clears the address setting. `Drivers::N4DSC08` supports the same address setting (immediate, no power cycle). See `claude/wj150-driver.md`.
- **Pulse counter dashboard display** — The shared device state card on Dashboard and Devices renders WJ150 count and frequency pairs as two channel rows (`count (frequency Hz)`), including zero readings. See `claude/pulse-counter-dashboard-ux.md`.
- **Interface enable/online state** — `HostInterface` carries two independent states with two different writers. `enabled` is operator intent, a plain toggle set from the UI (patching `enabled`; no review or verification step). `online` is the poller's report that it is holding the port open. The poller keeps one `ModBus::RTUClient` per interface open *across* cycles (`Poller::Connection`) instead of reopening every cycle, caching driver instances with it so a driver's setup writes — `Drivers::N4D8B08#configure!` writes the relationship register — happen once per connection rather than every cycle. `HostInterface#connection_state` folds intent, the report, and a `poller_reported_at` heartbeat into `online | offline | disabled | unknown`: a disabled bus reads `disabled` immediately and the poller releases the port within a cycle (there is no `releasing` state). Staleness gates `online`/`offline`, so a dead poller can't leave a phantom online bus. Serial-level errors (`SystemCallError`/`IOError`) drop the connection and reconnect next cycle, while Modbus protocol errors stay device-level and keep the port. `SIGTERM` releases every port and marks its bus offline. Enabling a bus with a pending or running scan is refused by validation. Hardware edits (port, serial settings, devices) apply live — the poller reconnects on a settings change and reconfigures a driver on a driver/address/settings change — with no "disable first" rule and no `configuration_revision`; edits are last-write-wins. `SerialBusLock` is taken only by the poller (guards against a second poller). See `claude/interface-online-state.md` and `claude/device-management-simplify.md`.
- **REST API** exposes devices, host interfaces/ports, logical inputs/diagrams/blocks/outputs, logic instances, input/output bindings, and instance traces with the RestfulApiController pattern (flat JSON wire format compatible with RestfulModelStore).
- **Host port scanning** — `HostPortScanner` enumerates the machine's real serial ports from `/sys/class/tty` (keeping only ttys with a bound `device/driver`, which excludes ptys and virtual consoles), enriches them with USB descriptors and `/dev/serial` aliases, and flags kernel consoles from `/proc/consoles`. It performs filesystem reads only and never opens a port, so it is safe to run from the web process while the poller is transacting on a bus. Exposed read-only as `HostPort`, a plain `Data.define` value object rather than an AR model; every request re-scans. `HostPort#id` is `Base64.urlsafe_encode64(stable_path)`, so ids are URL-safe with no route constraints, and `HostPortApi#by_ids` looks ids up against a fresh scan rather than decoding them into paths. `HostInterface#port` should hold the most stable path available (`by_id || by_path || device`); `HostInterface` also gained a required `name` and computed `port_present` / `resolved_device` (named `port_present?` rather than `present?` so it does not shadow `Object#present?`). The Devices tab lists discovered ports and turns a selected one into a prefilled new-interface form. See `claude/host-port-scan.md`.
- **Typed logical ports and bindings** — LogicInputs and LogicOutputs belong only to reusable diagrams. LogicInputBindings select a fixed value or an enumerated Device input; LogicOutputBindings select an enumerated Device output and carry the per-connection enable gate. Driver catalog compatibility is validated under a Device row lock. Boolean Device inputs can feed numeric diagram ports as `1.0`/`0.0`; missing/unbound inputs remain `null`.
- **Frontend UX** has top-level Dashboard, Instances, Logic, and Devices tabs. `frontend/src/App.tsx` owns shared loading and the root `TreeStore`; `frontend/src/uxTree.ts` defines typed tab state. Dashboard monitors devices and instances. Instances owns live connection/schedule/enable editing and manual computation. Logic edits hardware-independent definitions. Devices owns host-interface and Device CRUD, including dependency links back to the referencing instance. Live queries refresh every five minutes and use bounded store cache epochs.
- **LogicDiagram feature** — a diagram maps typed LogicInputs through stateful LogicBlocks (hysteresis, latch, timer counter, and expression) into typed LogicOutputs. It owns no hardware, scheduling, enable, trace, or latest-value state. Each LogicInstance evaluates that same definition independently, so retained block history and results do not cross between instances. Trace result schema v2 stores `logic_inputs`, `logic_blocks`, and `logic_outputs`; the reader retains v1 bucket compatibility. Expression semantics remain numbers/booleans/null with three-valued logic and explicit null fallback. The poller remains the sole physical writer and uses the latest instance trace only when both instance and output-binding gates are enabled. Deleting a diagram cascades its instances, bindings, and traces; deleting an instance leaves the diagram intact.
- **Logic runner** — the dedicated daemon schedules each LogicInstance by its `update_period` (minimum 1 s); diagrams without instances do not run. It remains asynchronous from the poller and communicates only through the instance's live state row. Each instance keeps a next-due time on a fixed grid (`previous due + period`, skipping ahead after a stall, never backfilling) and the loop sleeps until the earliest due time, at most one second so edits are noticed. Per-instance failures retry after ten seconds, and a PostgreSQL advisory lock prevents duplicate runners for one database. Production was migrated to instances on 2026-10-07.
- **Instance history (implemented locally, not deployed)** — `claude/instance-history.md`. Live state and history are separate: `logic_instance_states` (one row per instance, no `lock_version`/change notifications) holds the latest results and is what block state, `LogicInstance#result_for`, binding latest values and the runner's schedule read. An evaluation row-locks it (`LogicInstance#lock_state!`, `FOR UPDATE`), so the runner and `POST /traces` ("Compute now") evaluate one after the other, then updates it in place and inserts one full `traces` row (single INSERT, results computed in `before_create`). `traces` are raw history kept 48 h; `trace_rollups` are 1-minute buckets (numbers: min/max/mean/last/count; booleans: true_fraction/transitions/last/count; `null_count`) kept 2 years. `Logic::HistoryMaintenance` (called by LogicRunner about once a minute, every second while behind) rolls up complete minutes (older than a 1-minute grace), then prunes in 5,000-row batches; raw traces are never deleted past the newest rollup's end, so an un-rolled-up minute survives. `TraceApi` accepts `since`/`until`; `TraceRollupApi` is read-only (`logic_instance_id`, `since`, `until`, `limit`, newest first). `ApplicationRecord.async_commit_transaction` (`SET LOCAL synchronous_commit = off`) is used only by the runner's evaluations/maintenance and the poller's per-cycle write; web-request writes stay synchronous. Charts in the frontend are a separate task (the `TraceRollup` store model exists).

## Key Entry Points

- `config/routes.rb` — resources for hardware, logical definitions, instances, bindings, and traces.
- `app/apis/` — RestfulApi serializers for Device/HostInterface, LogicInput/Diagram/Block/Output, LogicInstance, both binding types, and Trace.
- `lib/restful_api_controller.rb` — controller mixin providing REST actions.
- `frontend/src/App.tsx` — main Preact dashboard component.
- `frontend/src/store.ts` — RestfulModelStore instance + model definitions.
- **Frontend I/O rule:** all server I/O goes through RestfulModelStore (`AxiosClient` is private to `store.ts`), and the API has no actions — only create/patch (an "action" becomes a field mutation or a new record). Components run store transactions through `useTxn`. See `claude/store-io-cleanup.md`.
- `frontend/src/lib/` — RestfulModelStore, DataLoader2, TreeStore, RateLimiter, MemoryStore (ported from BioTrack). RestfulModelStore has two-generation record/query caches; `query_version` is the separate per-model query invalidation counter. Mutation responses carry `invalidates` hints keyed by store model name (`queries` bumps `query_version`; `records` marks cached records stale without dropping their values).
- `frontend/build.mjs` — esbuild config + Tailwind CLI subprocess + `public/` → `dist/` copy. Dev server on port 5174 serving `dist/`; static build writes to `dist/`.

## Data Model

- `host_interfaces` — serial bus config (name, port, baud, parity, etc.) plus `enabled` (operator intent, written by the web process) and `online`/`poller_reported_at`/`connection_error` (the poller's report, never writable through the API). `port` should be a stable path — prefer `/dev/serial/by-id/...` over `/dev/ttyUSB0`, which is assigned in enumeration order and can move between adapters across reboots.
- `device_scans` — one bus-address sweep per row (`state` pending/running/done/failed/cancelled, `completed`/`total`, JSONB `results`, `error`); a new scan deletes the bus's older ones. Created and cancelled through the API, executed by the poller
- `devices` — Modbus devices (belongs_to host_interface, driver, modbus_address, current_state JSON, and JSONB input/output label overrides)
- `logic_inputs` — diagram-owned named typed input ports
- `logic_diagrams` — named reusable control-logic definitions
- `logic_blocks` — diagram-owned stateful/function blocks with expression inputs, config, state, and frontend-computed stratum
- `logic_outputs` — diagram-owned named typed output expressions
- `logic_instances` — diagram selection, schedule, master output gate, and runtime identity
- `logic_input_bindings` / `logic_output_bindings` — instance port connections to fixed values or real Device I/O; output bindings own their individual enable gate
- `traces` — raw history, one row per evaluation of a LogicInstance (48 h retention), with schema-versioned port/block results keyed by source ID; indexed `(logic_instance_id, recorded_at)`
- `logic_instance_states` — one row per LogicInstance (created on first evaluation): `recorded_at` and `results` of the latest evaluation, the runtime state
- `trace_rollups` — per-instance 1-minute value statistics (unique `(logic_instance_id, bucket_start)`), 2-year retention

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

## Hardware setup UX — simplified 2026-10-21

The original hardware-setup design (scan state machine on `host_interfaces`, `configuration_revision`, `quiet!`, review-and-enable with fresh-poll verification) was replaced; see `claude/device-management-simplify.md`. What stands:

- **Enable/disable** is a plain toggle of `enabled`; edits apply live and are last-write-wins. Kept real integrity rules: dependency check on device/interface delete (`HardwareConfiguration.deletable!`, with one confirm step listing dependencies), driver compatibility on device edit (`compatible!`), and `port_identity` uniqueness.
- **Scanning** is a `DeviceScan` record. Start = `POST /device_scans` (`host_interface_id`, `first_address`, `last_address`; the bus must be disabled, no other scan pending/running, 1 ≤ first ≤ last ≤ 247). Cancel = `PATCH /device_scans/:id` with `state: "cancelled"`, the only client-writable field after create. The poller executes a pending scan on a disabled bus synchronously (`HardwareScan`), at the bus's configured serial settings only (no baud sweep), re-reading only the scan's `state` between addresses to catch a cancel; other buses wait. Scans left `running` are failed on poller startup and shutdown. Read-only: scans never configure a device.
- Driver constructors have no hardware IO. The poller calls `configure!` before caching a normal-operation driver. Each driver implements `device_support` (yes/no/maybe plus evidence).
- **UI**: a "Scan for devices" button on the interface card (disabled while the bus is enabled), address range, progress bar and Cancel. Results list one row per responding address: an address already configured on the bus shows "Configured as ..." with a warning if the evidence disagrees; otherwise a driver dropdown preselected to the best verdict, a "Use as" select (new device or an existing device on this bus), and a "Why?" disclosure showing verdict reasons and registers read in words.

Production is unchanged until the 2026-10-21 migration (drops columns, creates `device_scans`) is deployed; restart the dev foreman/poller after migrating.

### Hardware setup production deployment — 2026-09-26

The previously local hardware setup implementation is now deployed at 894cdcf, following explicit user approval. Production migration/build succeeded, both services are active, and API checks confirm fresh successful relay polling. See hardware-setup.md for implementation and validation details.

### Enumerated measurement inputs production deployment — 2026-09-28

Device input/output catalogs and the measurement source selector are deployed at
`08d67c2`. Production web and poller services are active, HTTP health checks
pass, and both relay boards resumed fresh successful polling without errors.

## Device I/O labels — implemented locally

Device create/edit opens in an accessible modal and exposes label overrides for
every driver-declared input and output. Overrides live in one `io_labels` JSONB
column; API catalogs merge them over driver defaults. Instance binding selectors
display effective labels while bindings persist stable paths and numeric
channels. Label-only edits do not advance the parent bus revision or touch
hardware. Development and production are migrated for this earlier feature;
production is deployed at `cf38150`, with all services healthy and both relay
boards polling cleanly after restart. See `claude/device-io-labels.md` for design
and verification.
