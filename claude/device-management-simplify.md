# Device management simplify

Task name agreed 2026-10-21. Goal: cut the interlocking machinery around bus
enable/disable, hardware edits and device scanning down to something simple,
and clean up the scan UX.

## What exists today (and why it goes)

1. **`configuration_revision`**: the `HardwareRevision` concern,
   `HardwareConfiguration.check_revision!`, `Device#bump_bus_revision`, and the
   frontend "Reload for comparison / Keep my draft" flow in `HardwareForms.tsx`.
   This is a second optimistic lock, added because poller heartbeats bump
   `lock_version` every cycle. Nothing else in the app does stale-write checks:
   patches send only the fields that changed, and the last write wins. **Remove.**
2. **`HardwareConfiguration.quiet!`**: the bus must be disabled, the poller must
   confirm it's offline, no scan may be running, and the web process probes
   `SerialBusLock` before any port/serial edit or any device create, structural
   edit or delete. The poller already copes with live edits:
   `Connection#usable_for?` reconnects on a serial-settings change,
   `driver_for` reconfigures on a driver/address/settings change, and
   `retain_drivers_for` drops deleted devices. **Remove.**
3. **Enable flow**: "Review and enable" panel, then "Enable operation", then a
   client-side "two successful fresh polls per device" counter and a "Verify
   fresh polls" button. **Remove.** The `releasing` connection state also goes.
4. **Scan state machine on `host_interfaces`**: 9 `scan_*` columns, 8 states, a
   request id, an advisory lock and a per-address reload checkpoint. Progress
   writes bump the interface's `lock_version` and change notifications.
   **Replace** with a separate record.
5. **Scan UX**: comma-separated baud profiles, a "found at different serial
   settings" lockout, per-result driver radio lists, and raw JSON evidence.
   **Simplify.**

## Design

### Enable / disable
- A plain toggle that patches `enabled`. No confirmation, no verification.
- `HostInterface#connection_state` → `online | offline | disabled | unknown`.
  Disabled shows `disabled` immediately; the poller releases the port within
  a cycle.
- Enabling is refused (validation error) while the bus has a pending or running
  scan. Cancel the scan first.

### Edits
- Interface and device edits apply live; the poller picks them up next cycle.
  No "disable first" rule for anything except scanning.
- Kept: the dependency check on device/interface delete (`deletable!`) and the
  driver-compatibility check on device edit (`compatible!`). Both are real data
  integrity rules. Delete keeps one confirm step that lists dependencies.
- Kept: `port_identity` uniqueness (two interfaces can't claim one adapter) and
  `SerialBusLock` **in the poller only** (guards against a second poller). The
  web process never takes the flock.
- No `configuration_revision` on the wire; edits are last-write-wins.

### Scanning: `DeviceScan` record
- Table `device_scans`: `host_interface_id`, `first_address`, `last_address`,
  `state` (`pending | running | done | failed | cancelled`), `completed`,
  `total`, `results` (JSONB array), `error`, `started_at`, `finished_at`,
  timestamps. One row per scan. The UI shows the latest per interface. Creating
  a new scan deletes that interface's older scans, so there's no history.
- **Start** = `POST /device_scans` with `host_interface_id` and an address
  range. Validated: the bus is disabled, no other scan for it is
  pending/running, and 1 ≤ first ≤ last ≤ 247.
- **Cancel** = `PATCH /device_scans/:id` with `state: "cancelled"` (the only
  client-writable field after create). A pending scan is simply cancelled; a
  running one stops at the next address.
- Scans run at the **bus's configured serial settings only**. No baud sweep. To
  try another baud, edit the bus and scan again.
- **Executor**: the poller. Each cycle, for a disabled bus with a pending scan,
  it marks the scan running and sweeps synchronously, using `SerialBusLock` like
  a normal connection. Between addresses it re-reads only the scan's `state`, to
  catch a cancel. It persists progress every few addresses and on each hit. On
  poller startup, any `running` scan is marked `failed` ("poller restarted").
  Shutdown mid-scan marks it `failed`. The 15-minute cap goes away: the range
  bounds the time.
- Each result: `address`, `observed_at`, `driver_support` (yes/no/maybe +
  reason + evidence per driver, unchanged `device_support` contract).
- No changes to `host_interfaces`' `lock_version` during a scan. Scan rows opt
  into `ObservesRecordChanges` so progress streams to the UI.

### Scan UX
- On the interface card: a "Scan for devices" button, enabled only while the bus
  is disabled. When the bus is enabled, the button explains "Disable the bus to
  scan".
- Clicking it shows address range inputs (default 1–247), Start, then a progress
  bar (`completed/total`) and Cancel.
- Results list, one row per responding address:
  - If a device on this bus already has that address: "Configured as *name*
    (*driver*)", plus a warning if the best driver verdict disagrees.
  - Otherwise: a driver dropdown preselected to the best verdict (`yes` before
    `maybe`; `no` options disabled), a "Use as" select (New device or an
    existing device on this bus), and an Add / Use button. Adding creates the
    device; using patches the existing device's driver and address.
  - "Why?" disclosure shows the verdict reasons and evidence in readable form
    rather than raw JSON.
- An empty result says "No devices responded at *baud/format*. Check wiring,
  power and serial settings."

## Implementation plan

Red-green with RSpec and vitest at each step.

1. **Migration**: create `device_scans`; drop `configuration_revision` from
   `host_interfaces` and `devices`; drop `scan_state`, `scan_request_id`,
   `scan_options`, `scan_results`, `scan_requested_at`, `scan_started_at`,
   `scan_finished_at` and `scan_updated_at` from `host_interfaces`. No data to
   keep. Migrate dev and test.
2. **Backend: remove the revision/quiet machinery.** Delete
   `HardwareRevision`, `check_revision!`, `quiet!`, `Device#bump_bus_revision`
   and `with_quiet_buses`. Simplify `HostInterfaceApi#update/destroy` and
   `DeviceApi#create/update/destroy` to plain saves, plus `deletable!` and
   `compatible!`. Drop `releasing` from `connection_state`. Add the
   "can't enable while scanning" validation. Update specs
   (`hardware_setup_spec`, `hardware_journey_spec`, `devices_spec`,
   `host_interface_spec`, `record_locking_spec`).
3. **Backend: `DeviceScan`.** Model + validations, `DeviceScanApi` (query by
   `host_interface_id`, create, patch-to-cancel only), and the route. Rewrite
   `HardwareScan` as the executor over a `DeviceScan` at the bus's settings.
   Poller integration (pick up pending scans on disabled buses, fail stale
   `running` scans at startup and on shutdown). Rewrite `hardware_scan_spec`;
   adjust `poller_spec`.
4. **Frontend store**: add the `DeviceScan` model; remove the `scan_*` and
   `configuration_revision` fields from `HostInterfaceFields`/`DeviceFields`.
5. **Frontend UI**: an enable toggle in `HostInterfaceCard` (drop the review and
   verification state). Remove the comparison/revision UI from `Editor` and the
   "disable first" copy. Rewrite `DeviceScanPanel` per the scan UX above.
   Delete now-dead helpers (`scanActive` on interfaces, `matchesBus`). Update
   `HardwareSetup.test.tsx` and `hardware.test.ts`.
6. **Verify**: rspec, vitest, tsc, build, rubocop on touched files. Run the UI
   against a dev server on port 3002 (no second poller) and take a Playwright
   screenshot of the Devices tab.
7. **Docs**: update `claude/overview.md` (Interface enable/online state and
   Hardware setup UX sections) and mark superseded parts of
   `claude/hardware-setup.md` / `claude/interface-online-state.md`.

Production deploy is a separate, explicit step: the migration drops columns.

## Implemented — 2026-10-21

Steps 1-5 and 7 done; step 6 partly (see below). Uncommitted, undeployed.

- Migration `20261021000000_simplify_device_management`: creates `device_scans` (with `lock_version`, so `ObservesRecordChanges` works), drops `configuration_revision` from `host_interfaces`/`devices` and the eight `scan_*` columns. Dev and test migrated.
- Backend: removed `HardwareRevision`, `check_revision!`, `quiet!`, `Device#bump_bus_revision`, `with_quiet_buses`, `releasing`. `HostInterfaceApi`/`DeviceApi` are plain saves plus `deletable!`/`compatible!`. `HostInterface#scan_active?` now queries `device_scans`, and a validation refuses `enabled` going true while a scan is active. New `DeviceScan` model, `DeviceScanApi`, `DeviceScansController`, route (`index/show/create/update`), `RecordResources` entry. `HardwareScan` is now the executor (`.new(scan, stopping:).run`, `.fail_running(reason)`). Poller runs pending scans for disabled buses, fails stale `running` scans at startup and in `shut_down`.
- Frontend: `DeviceScan` model in the store, `device_scan` added to `RecordStream` resources; `HostInterfaceCard` is a plain Enable/Disable toggle; `Editor` lost the comparison UI; `DeviceScanPanel` rewritten (range, progress, cancel, results with driver dropdown, Use-as, readable "Why?"); `scanActive`/`matchesBus`/`SerialProfile` removed, `bestSupport`/`describeEvidence`/`distinctEvidence` added.

Details and small deviations:
- `DeviceScan` defaults `first_address`/`last_address` to 1/247 so `POST /device_scans` with only `host_interface_id` scans everything. `total` is computed server-side.
- Cancelling a scan that has already finished is a no-op (200), not an error. Any other `state` value is 422.
- A cancelled scan keeps the results gathered so far. A cancel that lands mid-address drops that address's partial verdicts.
- Scan progress arrives over the record stream (each executor write bumps `lock_version` and NOTIFYs); there is no scan poll. A new scan appears because `startScan` refreshes the query and the create's `invalidates` hint bumps it.
- Fixed app-wide: `invalidates` hints were sent keyed by class name (`"DeviceScan"`) while the store keys models by `name` (`"device_scan"`), so every hint was ignored. `RestfulApiController#store_invalidations` now underscores the API class name. A `records` hint now marks that model's cached records stale (values stay while they refetch) instead of clearing the cache.
- Not done: a Playwright screenshot of the Devices tab. Playwright's Chromium is not installed on this machine, and the task said not to download it. The UI is covered by vitest component tests only. Also no live server was started on 3002, since a scan created against the shared dev database would be picked up by the running dev poller.
- Pre-existing, unrelated: two `host_ports_spec` examples fail here (they need `/dev/ttyUSB0`).
- Fixed after the dev-build test: `HardwareScan#checkpoint` reads the scan state `uncached`. The poller's reloader wrap enables the query cache, so a cancel from the web process used to be seen only after the next progress write (up to 5 addresses).
- Verified on the dev build (2026-10-21): a running scan's progress and its cancellation reach an open Devices tab over the record stream, with no poll. A scan created in another tab isn't discovered until reload (the stream carries no creates or deletes).
