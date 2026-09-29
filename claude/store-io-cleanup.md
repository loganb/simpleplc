# Store I/O cleanup

Task name: `store-io-cleanup`.

## Problem

The frontend is meant to do all server I/O through `RestfulModelStore`. The
hardware setup workflow (894cdcf) instead imports the raw `AxiosClient` from
`store.ts` and calls it from three Devices-tab components:

| File | Direct calls |
| --- | --- |
| `HardwareForms.tsx` | GET `/drivers`, GET `/host_ports`, GET `/{resource}/:id` (load + reload for comparison), POST create, PATCH update, GET `…/impact`, DELETE with `configuration_revision` |
| `HostInterfaceCard.tsx` | PATCH enable / disable, GET `…/impact` |
| `DeviceScanPanel.tsx` | GET `/drivers`, POST `…/scan`, `…/cancel_scan`, `…/preview`, `…/apply`, GET interface + devices for reload for comparison |

`HardwareSetup.test.tsx` mocks `AxiosClient` directly.

Consequences: responses skip `update_store` (response ordering, lock_version
rejection, `invalidates` — `apply` sends one that is thrown away), skip the rate
limiter, duplicate fetches (every `DeviceScanPanel` refetches `/drivers`;
`InterfaceEditor` refetches `/host_ports` that `DevicesTab` already queries), and
the UI relies on `onRefresh` prop-drilling plus the 3-second forced re-query to
catch up.

## Design principle: no actions

The API has only resources. A client changes state by **creating** or
**patching** a record — never by calling a verb. Anything currently shaped as an
action (`scan`, `cancel_scan`, `preview`, `apply`, `impact`) must be recast as
one of:

- a mutation of a field on an existing record (e.g. a flag), or
- the creation of a different record (e.g. a request or result object), or
- a read of a record/field.

This keeps `RestfulModelStore` to fetch / query / create / patch / destroy.

## Phase 1 — refactor what the store already supports (this change)

Constraint: **no changes to `RestfulModelStore`.** Everything that needs one
waits for phase 2.

1. **Driver model.** `DriversController#index` already returns the store wire
   format (`drivers` + `query`). Add a `Driver` model definition in `store.ts`
   and a `show` action so Driver is a complete read-only resource like
   HostPort (the store fetches single records by id when they are not
   cached). Replace both `/drivers` fetches with a `useDrivers()` hook over
   `Store.m(Driver).queryFor(null, {})`.
2. **Host ports in `InterfaceEditor`.** Use `Store.m(HostPort).queryFor`, forced
   once on open and on "Rescan ports" (same token pattern as `DevicesTab`).
3. **`Editor` load.** Read the record with `Store.m(model).fetch(editId)` via
   `useLoaders`, and seed the draft once when it is first found and not stale.
   The draft still captures the revision at open. No forced fetch on open: the
   stream + 3 s re-query keep the cached record as current as the rest of the
   page, and the server rejects a stale revision anyway.
4. **Reload for comparison** (`Editor` and `DeviceScanPanel`). Force-refresh
   through the store and display the live store record / live props instead of
   a separately fetched snapshot. "Keep my draft against this revision" adopts
   the revision being shown.
5. **Tests.** `HardwareSetup.test.tsx` stops mocking the `store` module; it
   stubs methods on the real `AxiosClient` instance, which the `Store` uses, so
   both paths are covered.
6. **Docs.** Record the "all I/O through RestfulModelStore / no actions" rule in
   `CLAUDE.md`, `AGENTS.md` and `claude/overview.md`.

### Deliberately left on Axios in phase 1

These are plain CRUD but the store cannot do them without losing behavior:

- **Save (create/patch) in `Editor`, enable/disable in `HostInterfaceCard`.**
  `RestfulModelStore.patch` discards the error response, so 409 revision
  conflicts, "Cancel the scan…" and validation messages would degrade to a
  generic failure. `create` reads `error.response.data` unguarded and throws on
  a network error.
- **Delete in `Editor`.** The server requires `configuration_revision` on
  DELETE; `destroy` cannot send parameters.
- **All actions**: `scan`, `cancel_scan`, `preview`, `apply`, and both `impact`
  reads.

`AxiosClient` therefore stays exported until phase 2.

### Phase 1 result

Implemented as planned. Notes from implementation:

- Store queries send `?q={}`, so URLs are `/drivers.json?q=%7B%7D`; test mocks
  must match by prefix.
- `vitest.config.ts` gained the `react` → `preact/compat` alias that tsconfig and
  esbuild already had. Without it no component test could import
  `DataLoader2` — probably one reason the hardware components used axios.
- `useDrivers` lives in its own file so `hardware.ts` stays free of the store
  and its node-environment test keeps working.
- Browser check against a dev server on port 3002 (dev DB, no poller): the Devices
  tab makes one `/drivers` request shared by every scan panel and the device
  editor. Editors open from cache with no per-record GET. Host ports are rescanned
  once when the interface editor opens.

## Phase 2 — actions become plain CRUD (agreed 2026-09-29)

### Scan: patch the state machine

States stay `idle → requested → scanning → completed | failed | cancelled |
interrupted`, plus a new `cancelling`, which replaces the `scan_cancel_requested`
boolean. The client may write exactly two transitions; everything else is the
poller's:

- **PATCH `scan_state: 'requested'` + `scan_options`**, from `idle` or any
  terminal state (this is also "scan again"). Rejected while the bus is
  enabled or a scan is active. The validation in `HardwareScan.request`
  (address range, 1–4 serial profiles) moves into the update path.
- **PATCH `scan_state: 'cancelling'`.** From `requested`, the server goes
  straight to `cancelled`. From `scanning`, it stays `cancelling` until the
  poller's checkpoint finishes it as `cancelled`. A poller that restarts and
  finds `cancelling` finishes it as `cancelled`, not `interrupted`.

`scan_request_id` becomes server-generated on the move to `requested`. A
duplicate request gets "already pending". A stale cancel can stop a newer scan;
that's accepted, since scans are read-only. Scan-state patches are not
configuration edits: they don't advance or require `configuration_revision`,
and they may not be combined with configuration fields in one request.

### Reconciliation: removed, replaced by device CRUD

Preview/apply (`HardwareConfiguration#execute`) validated and atomically applied
a whole proposed device list. It existed for address swaps (hardware-setup
deficiency #3). The rest of it enforced a UI path the manual Device form already
bypasses. Replacement:

- A scan result card offers **"Add as new device"**, which creates a Device with
  address, driver and a default name, and **"Use for device #N"**, which patches
  that device's driver and address. Removal is the normal device delete. An
  address swap is done as delete-then-move; the uniqueness error explains a
  wrong order.
- **Impact is computed client-side** from the Measurement and OutputBlock
  queries `App` already loads (each has `device_id`). Both `impact` endpoints go.
- **Removed:** the `preview`, `apply`, `impact`, `scan` and `cancel_scan` routes;
  `HardwareConfiguration#execute`, `validate_scan_choice!` and `.impact`;
  `Device#reconciling`; the `last_apply` column; the draft / "reload for
  comparison" half of `DeviceScanPanel`.
- **Kept:** `quiet!` (bus disabled and idle for structural changes),
  `check_revision!` on updates, `deletable!` (no deleting a device that
  measurements or outputs depend on), and `compatible!` (no driver change that
  breaks existing measurements or outputs).

### Store and delete

- `RestfulModelStore.patch` keeps the error payload (`errors`, HTTP status) on
  `TxnResult`, as `create` and `destroy` already do. `create`'s error path
  guards a missing `error.response` (a network error currently throws there
  and leaves the txn pending forever).
- **DELETE drops the revision check.** `deletable!` and the disabled-bus
  requirement are the real protections, so `destroy` needs no parameters.
- Afterwards no component imports `AxiosClient`; stop exporting it. Then revisit
  whether `onRefresh` and the 3 s forced re-query are still needed (separate
  change).

## Implementation plan (phase 2)

1. **Store:** `TxnResult` gains `errors` and HTTP `status` for patch; guard
   create's error path. Store tests for both.
2. **Backend scan:** migration adding `cancelling` handling and dropping
   `scan_cancel_requested` and `last_apply`. The HostInterface update path
   accepts scan-only patches (`scan_state` ∈ {requested, cancelling} +
   `scan_options`) with the transition rules above, and generates
   `scan_request_id`. `HardwareScan` checkpoint and startup handle `cancelling`.
   Specs: each allowed/rejected transition, requested→cancelled directly,
   scanning→cancelling→cancelled via the poller, restart in `cancelling`.
3. **Backend removal:** delete `scan`, `cancel_scan`, `preview`, `apply` and both
   `impact` routes/actions, plus `HardwareConfiguration#execute`,
   `validate_scan_choice!`, `.impact` and `Device#reconciling`. DELETE no longer
   requires `configuration_revision`. Update `hardware_setup_spec`,
   `hardware_journey_spec` and poller specs.
4. **Frontend:**
   - `useImpact(deviceIds)` over the store's Measurement and OutputBlock
     queries, used by the delete review and the "Review and enable" panel.
   - `Editor` save/delete via `Store` create/patch/destroy + `useTxnStatus`,
     errors from `TxnResult`.
   - `HostInterfaceCard` enable/disable via `Store.m(HostInterface).patch`.
   - `DeviceScanPanel`: scan and cancel via patch; per-result "Add as new" /
     "Use for #N" via Device create/patch; remove the draft/preview/apply
     section.
5. Stop exporting `AxiosClient`; rewrite `HardwareSetup.test.tsx` against a fake
   axios passed to the store only.
6. Tests, typecheck, build, rspec, RuboCop on touched files; browser check against a
   dev server on a spare port (not 3001, which is production); update
   `claude/overview.md` and `claude/hardware-setup.md` (reconciliation removed).

## Implementation plan (phase 1)

1. Baseline: run frontend tests + typecheck; run the hardware request specs.
2. Backend: `resources :drivers, only: [:index, :show]`, `DriversController#show`
   returning `{ drivers: [driver] }` or 404; request spec.
3. `store.ts`: `Driver` model definition; `DriverFields` unchanged.
4. `useDrivers.ts`: `useDrivers()` hook.
5. `HardwareForms.tsx`: `Editor` takes a model definition instead of a resource
   string; store-backed load and comparison; `InterfaceEditor` host ports via
   store; `DeviceEditor` drivers via `useDrivers`.
6. `DeviceScanPanel.tsx`: drivers via `useDrivers`; comparison from live props
   after a forced refresh.
7. Rework `HardwareSetup.test.tsx` mocks; add a test for store-backed
   comparison.
8. Tests, typecheck, build, rspec; screenshot the Devices tab against a dev
   server on a spare port (3001 is production).
9. Docs updates.
