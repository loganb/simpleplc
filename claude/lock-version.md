# Lock version

Status: implemented. User explicitly approved normal updated_at changes on every table.

## Design

Prerequisite to websocket-store: add Rails optimistic locking to all seven application tables and route runtime record writes through validation/callback-enabled Active Record persistence.

Tables: host_interfaces, devices, logic_diagrams, measurements, logic_blocks (including STI subclasses), output_blocks, traces. Add integer lock_version, default 0, NOT NULL. Existing rows start at zero. HostPort has no table. Rails metadata and Solid infrastructure tables remain framework-managed.

Replace three bypasses:
- Poller#poll_device update_columns.
- HostInterface#report_connection update_columns.
- Poller#shut_down update_all, using individual record saves after closing all ports.

Use attribute assignment plus save! for telemetry/report writes with normal updated_at changes while running validations, save/update callbacks and commit callbacks. Ordinary edits retain timestamp updates. Persisted changes increment lock_version; no-op saves need not increment it.

Concurrency:
- Retain normal ActiveRecord::StaleObjectError behavior for stale model saves/destroys.
- For poller-owned fields, retry only database persistence after reloading and reapplying the observation, with a bounded retry count. Never rerun hardware reads/writes as part of retry.
- Compare current device communication identity (host_interface_id, driver, modbus_address) with the sampled identity after reload; discard observations for a changed target.
- Do not overwrite operator-owned attributes. Handle deleted records and exhausted retries without terminating the polling loop; log failures. Close all ports before shutdown persistence and continue reporting other interfaces if one report fails.
- Return an explicit HTTP conflict response for a request-time StaleObjectError; do not silently retry arbitrary operator mutations. End-to-end browser edit-version preconditions are deferred; this task does not automatically submit cached lock_version on every mutation.

Expose lock_version consistently on persisted application API records, including sideloads. Before enabling that output, remove the store's assumption that equal row versions imply equal serialized representations: derived trace fields and time/filesystem fields can change with unchanged lock_version. Preserve current repaint behavior in this prerequisite. Record stream ordering/representation invalidation remains later work.

Historical SQLite importer is an explicit offline restore exception: it uses anonymous models and insert!/TRUNCATE to preserve snapshots. Replacing those with normal Trace.create! would recompute history through after_create. Leave restoration semantics intact and document the exception; future live clients must resync after restore. Runtime hooks will not cover arbitrary SQL or bulk bypasses introduced later.

## Implementation plan (before code changes)

1. Add failing RSpec coverage for locking schema/defaults, stale concurrent saves and destroys, callback/after_commit delivery on telemetry/report/shutdown writes, and no commit notification on rollback. Test persisted versions after Trace's nested creation/evaluation path.
2. Add migration for seven tables and regenerate schema using the project toolchain. Test schema/default behavior and stale saves. Use test database first; do not migrate production as part of this task.
3. Replace runtime bypasses with callback-enabled saves. Add bounded persistence-only conflict handling, deleted-row behavior and device-target change checks. Red/green tests must verify concurrent operator changes survive, no extra hardware IO occurs, timestamps advance, and shutdown reports remaining interfaces after individual failures.
4. Add failing request specs for serialized versions (including STI/sideloads) and conflict responses. Add a focused existing-Vitest regression proving changed computed fields with equal lock_version still update the UX-facing store sequence. Implement API serialization and adjust store equality behavior.
5. Update existing poller specs to reload intentionally stale fixtures before unrelated edits; retain explicit stale-object cases rather than hiding them with blanket reloads.
6. Run relevant RSpec, full RSpec if targeted checks pass, frontend Vitest/build for the store change, and inspect runtime code for remaining bypasses. Use fake hardware throughout.
7. Update overview and task notes with results and any necessary development process restart/schema-cache instructions.

## Parent task scope update

websocket-store now focuses on updates to already-known records. Query membership, creation discovery, query invalidation/recomputation, and deletion-stream design are deferred. The proposed prerequisite enables application callbacks in place of the earlier database-trigger/outbox recommendation; that infrastructure is not approved or required by this prerequisite.

Related-row changes can still alter an existing record's representation. This remains a record-update design issue, not a reason to reintroduce query scope. Decide its version/notification policy when returning to websocket-store.

## Implementation results

Implemented: seven application tables have lock_version; runtime poller writes use validated saves, normal timestamps and callbacks. Bounded persistence retries preserve operator edits without repeating hardware IO and skip deleted/retargeted devices. API payloads expose versions; request-time stale writes return HTTP 409. Store sequences advance for received payloads because equal row versions do not imply equal computed fields. Offline SQLite restoration remains a documented callback-bypass exception.

Validation: initial regression specs failed before implementation. Final full RSpec: 149 examples, 0 failures. Frontend: 16 tests passed; build passed. Ruby formatting checked/corrected; git diff --check passed. Covered commit/rollback callbacks, retry exhaustion, concurrent edits, retargeted/deleted devices, shutdown callbacks and validation failure, trace evaluation versions, and HTTP conflicts.

Migrations applied to test and development only; production was not migrated. Tests used fake hardware. Restart Foreman API and poller processes to reload schema caches. WebSocket implementation and query invalidation remain deferred.
