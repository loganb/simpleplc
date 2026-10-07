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

- **Modbus polling** working — three devices (DS18B20 temp board, NTC temp board, relay I/O board) polled and state stored in `devices.current_state` JSON column. The N4D8B08 relay I/O driver writes unrelated input/output relationship mode through explicit configure! during normal connection preparation so physical input highs do not toggle relay outputs.
- **Interface enable/online state** — `HostInterface` carries two independent states with two different writers. `enabled` is operator intent, set from the UI; `online` is the poller's report that it is holding the port open. The poller keeps one `ModBus::RTUClient` per interface open *across* cycles (`Poller::Connection`) instead of reopening every 10s, caching driver instances with it so a driver's setup writes — `Drivers::N4D8B08#configure!` writes the relationship register — happen once per connection rather than every cycle. Disabling is a request, not an act: the web process never touches the port, so the UI shows `releasing` until the poller confirms by writing `online: false`. `HostInterface#connection_state` folds intent, the report, and a `poller_reported_at` heartbeat into `online | offline | releasing | disabled | unknown`; staleness gates both directions so a dead poller can't leave a phantom online bus. Serial-level errors (`SystemCallError`/`IOError`) drop the connection and reconnect next cycle, while Modbus protocol errors stay device-level and keep the port. `SIGTERM` releases every port and marks its bus offline. See `claude/interface-online-state.md`.
- **REST API** exposes devices, host interfaces/ports, logical inputs/diagrams/blocks/outputs, logic instances, input/output bindings, and instance traces with the RestfulApiController pattern (flat JSON wire format compatible with RestfulModelStore).
- **Host port scanning** — `HostPortScanner` enumerates the machine's real serial ports from `/sys/class/tty` (keeping only ttys with a bound `device/driver`, which excludes ptys and virtual consoles), enriches them with USB descriptors and `/dev/serial` aliases, and flags kernel consoles from `/proc/consoles`. It performs filesystem reads only and never opens a port, so it is safe to run from the web process while the poller is transacting on a bus. Exposed read-only as `HostPort`, a plain `Data.define` value object rather than an AR model; every request re-scans. `HostPort#id` is `Base64.urlsafe_encode64(stable_path)`, so ids are URL-safe with no route constraints, and `HostPortApi#by_ids` looks ids up against a fresh scan rather than decoding them into paths. `HostInterface#port` should hold the most stable path available (`by_id || by_path || device`); `HostInterface` also gained a required `name` and computed `port_present` / `resolved_device` (named `port_present?` rather than `present?` so it does not shadow `Object#present?`). The Devices tab lists discovered ports and turns a selected one into a prefilled new-interface form. See `claude/host-port-scan.md`.
- **Typed logical ports and bindings** — LogicInputs and LogicOutputs belong only to reusable diagrams. LogicInputBindings select a fixed value or an enumerated Device input; LogicOutputBindings select an enumerated Device output and carry the per-connection enable gate. Driver catalog compatibility is validated under a Device row lock. Boolean Device inputs can feed numeric diagram ports as `1.0`/`0.0`; missing/unbound inputs remain `null`.
- **Frontend UX** has top-level Dashboard, Instances, Logic, and Devices tabs. `frontend/src/App.tsx` owns shared loading and the root `TreeStore`; `frontend/src/uxTree.ts` defines typed tab state. Dashboard monitors devices and instances. Instances owns live connection/schedule/enable editing and manual computation. Logic edits hardware-independent definitions. Devices owns host-interface and Device CRUD, including dependency links back to the referencing instance. Live queries refresh every five minutes and use bounded store cache epochs.
- **LogicDiagram feature** — a diagram maps typed LogicInputs through stateful LogicBlocks (hysteresis, latch, timer counter, and expression) into typed LogicOutputs. It owns no hardware, scheduling, enable, trace, or latest-value state. Each LogicInstance evaluates that same definition independently, so retained block history and results do not cross between instances. Trace result schema v2 stores `logic_inputs`, `logic_blocks`, and `logic_outputs`; the reader retains v1 bucket compatibility. Expression semantics remain numbers/booleans/null with three-valued logic and explicit null fallback. The poller remains the sole physical writer and uses the latest instance trace only when both instance and output-binding gates are enabled. Deleting a diagram cascades its instances, bindings, and traces; deleting an instance leaves the diagram intact.
- **Logic runner** — the dedicated daemon schedules each LogicInstance by its `update_period`; diagrams without instances do not run. It remains asynchronous from the poller and communicates only through Trace records. Missing intervals are not backfilled, per-instance failures retry after ten seconds, and a PostgreSQL advisory lock prevents duplicate runners for one database. Production was migrated to instances on 2026-10-07.

## Key Entry Points

- `config/routes.rb` — resources for hardware, logical definitions, instances, bindings, and traces.
- `app/apis/` — RestfulApi serializers for Device/HostInterface, LogicInput/Diagram/Block/Output, LogicInstance, both binding types, and Trace.
- `lib/restful_api_controller.rb` — controller mixin providing REST actions.
- `frontend/src/App.tsx` — main Preact dashboard component.
- `frontend/src/store.ts` — RestfulModelStore instance + model definitions.
- **Frontend I/O rule:** all server I/O goes through RestfulModelStore (`AxiosClient` is private to `store.ts`), and the API has no actions — only create/patch (an "action" becomes a field mutation or a new record). Components run store transactions through `useTxn`. See `claude/store-io-cleanup.md`.
- `frontend/src/lib/` — RestfulModelStore, DataLoader2, TreeStore, RateLimiter, MemoryStore (ported from BioTrack). RestfulModelStore has two-generation record/query caches; `query_version` is the separate per-model query invalidation counter.
- `frontend/build.mjs` — esbuild config + Tailwind CLI subprocess + `public/` → `dist/` copy. Dev server on port 5174 serving `dist/`; static build writes to `dist/`.

## Data Model

- `host_interfaces` — serial bus config (name, port, baud, parity, etc.) plus `enabled` (operator intent, written by the web process) and `online`/`poller_reported_at`/`connection_error` (the poller's report, never writable through the API). `port` should be a stable path — prefer `/dev/serial/by-id/...` over `/dev/ttyUSB0`, which is assigned in enumeration order and can move between adapters across reboots.
- `devices` — Modbus devices (belongs_to host_interface, driver, modbus_address, current_state JSON, and JSONB input/output label overrides)
- `logic_inputs` — diagram-owned named typed input ports
- `logic_diagrams` — named reusable control-logic definitions
- `logic_blocks` — diagram-owned stateful/function blocks with expression inputs, config, state, and frontend-computed stratum
- `logic_outputs` — diagram-owned named typed output expressions
- `logic_instances` — diagram selection, schedule, master output gate, and runtime identity
- `logic_input_bindings` / `logic_output_bindings` — instance port connections to fixed values or real Device I/O; output bindings own their individual enable gate
- `traces` — explicit computation runs for one LogicInstance, with schema-versioned port/block results keyed by source ID

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

The approved hardware-setup plan is implemented; see `claude/hardware-setup.md` for API design and validation, as simplified by `claude/store-io-cleanup.md`. A disabled HostInterface holds one scan state machine (`idle → requested → scanning → [cancelling →] completed | failed | cancelled | interrupted`), a server-generated scan id, options and JSON results. Clients move it only by patching `scan_state` to `requested` (with `scan_options`) or `cancelling`. The poller executes the whole read-only scan synchronously; other interfaces wait. Per-interface threading remains future work.

Driver constructors have no hardware IO. The poller calls configure! before caching a normal-operation driver; scans never configure devices. Each driver implements device_support (yes/no/maybe plus evidence). The UX lists all verdicts; the operator picks a driver and either creates a new Device from a result or patches an existing one to it.

Devices supports port replacement, scan/cancel, plain device CRUD from scan results, dependency-aware deletion (impact computed from LogicInputBinding/LogicOutputBinding queries and enforced again by the server), structured errors/conflict recovery and two-fresh-poll verification after enable. Configuration revisions protect operator edits independently of heartbeat/scan updates. Shared serial locks and unique adapter claims prevent cooperating processes or aliases from owning the same bus. Stale connection-error text still clears on the next poll.

Validation: 181 RSpec examples and 33 frontend tests pass; TypeScript and frontend build pass. Includes an API/poller journey against a fake RTU endpoint and Preact component tests. Real Chromium smoke checking timed out; visual browser verification remains unconfirmed. Development/test databases migrated; restart development API/poller to load the schema/code. Production is unchanged, and implementation changes remain uncommitted and undeployed.


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
