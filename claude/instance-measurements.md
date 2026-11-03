# Instance Measurements

Status: plan approved by Logan; implemented and verified locally. Not deployed.

This replaces the old, removed diagram/device measurement concept described in
`claude/measurements.md`.

## Agreed design

- A measurement is a named, independent history series, attached to zero or one
  input/output of a LogicInstance. Multiple measurements may share a port.
- Record once per evaluation, including Compute now, from that evaluation's
  results and timestamp. Outputs are computed values regardless of enable gates
  or hardware read-back. Preserve numbers, booleans and null without coercion.
- Detaching stops recording. Reattaching preserves history, including across
  instances, ports and numeric/boolean types. Each sample snapshots source
  identity, names and declared type so subsequent edits cannot rewrite history.
- Instance/port deletion, diagram deletion, or an instance's diagram change
  detaches affected measurements; measurement records and history survive.
- Retention matches traces: raw samples 48 hours, minute summaries two years,
  one-minute grace, bounded catch-up and pruning, never pruning unrolled data.
- Measurements tab shows tiled cards with name, current attachment/detached state
  and latest five raw points, newest first. When no raw points remain, show up
  to five newest summaries explicitly labeled as summaries. New measurements
  have an empty state.
- Instances tab has Attach measurement: a modal selects an existing measurement
  or creates a named detached one, then selection mode highlights eligible I/O.
  Clicking a port attaches/reassigns the measurement. A persistent prompt,
  Cancel and Escape exit selection mode; switching instances/tabs also cancels.
  Reassignment makes its existing source visible in the modal.
- Each measured I/O shows a small accessible icon. Its dropdown lists attached
  measurement names with a detach control for each. Normal binding editing
  continues to work outside selection mode.
- Historical charts, hardware probes and configurable sample cadence are outside
  this task. No new hardware reads, writes, pollers or hardware controls.

## Schema

1. `measurements`: name (required, human-readable, unique), nullable
   `logic_instance_id`, polymorphic `source_type` / `source_id`, timestamps and
   lock_version. Rails association: `belongs_to :source, polymorphic: true,
   optional: true`, with inverse measurement associations on LogicInput and
   LogicOutput. Keep an instance FK; polymorphic sources cannot use a normal
   database FK. Database checks enforce detached (instance and both source
   fields null) or attached (all three present), with source_type restricted to
   LogicInput/LogicOutput for now. Model validation verifies source existence
   and that it belongs to the instance's diagram. Index `(source_type, source_id)`
   and instance reference; no uniqueness restriction on attachment. Source
   lifecycle callbacks detach the complete tuple atomically, rather than merely
   nullifying the polymorphic fields and leaving the instance reference behind.
2. `measurement_samples`: measurement FK, recorded_at, JSONB snapshot containing
   value, declared value_type, instance/diagram/port IDs and names, and timestamps.
   Composite index `(measurement_id, recorded_at, id)`. Source IDs inside the
   snapshot deliberately have no cascading FK. No trace FK: trace deletion or
   diagram replacement must not remove measurement history. No record-change
   notifications or optimistic locking on samples.
3. `measurement_rollups`: measurement FK, minute-aligned bucket_start,
   sample_count, JSONB summaries, timestamps; unique `(measurement_id,
   bucket_start)`. Group statistics by attachment identity AND declared type
   within a minute so mixed-source/type reattachments are distinguishable.
   Preserve source labels in each group. Use trace numeric/boolean/null statistics.
   No per-tick measurement row update or sample notification.

## API and frontend data

- Standard Measurement resource index/show/create/update. Create named detached
  records; patch `logic_instance_id`, `source_type`, and `source_id` together to
  attach/reassign, or all three null to detach. Only LogicInput/LogicOutput are
  accepted source types; never constantize arbitrary client input. Expose current
  source metadata. No verb endpoints.
- Read-only MeasurementSample and MeasurementRollup resources, filtered by
  measurement_id, since/until and bounded limit, newest timestamp then ID first.
- Measurement serialization includes a bounded latest-five preview (raw first,
  summaries only when raw is empty), loaded in batches to avoid per-card queries.
  This keeps initial card loading independent of one HTTP request per card.
- Add typed Store models; all I/O uses Store queryFor/create/patch and existing
  transaction/error presentation patterns. Add measurements to root loading,
  refresh and typed tab navigation. Explicitly refresh after attach/detach and
  Compute now; use the existing periodic query refresh for new runner samples.
  Do not stream every sample or add high-frequency frontend polling.

## Implementation plan (red-green-refactor)

1. Add failing RSpec model examples for detached/attached states, source diagram
   validation, multiple probes per port, free-form names, invalid tuples,
   unsupported polymorphic types and missing sources.
   Implement schema and model validation; test DB constraints as appropriate.
2. Add lifecycle specs for port/instance/diagram deletion and diagram replacement.
   Implement atomic detachment under measurement row locks before source removal.
   Ensure this also works with association dependent callbacks and rolls back on
   failed edits; preserved history is never linked through source cascades.
3. Add evaluation specs for each port direction/type, null, Compute now, no
   samples while detached, later reattachment and rollback of failed evaluation.
   Record snapshots inside Trace creation's existing transaction, after computed
   results are available. Lock attached measurement rows in ID order and reload
   attachment under lock. Attachment patches use the same rows, establishing a
   clear transaction boundary for concurrent detach/evaluation. Review lock order
   against state locking and source deletion to avoid deadlocks. Batch INSERT
   samples without per-sample callbacks/notifications; keep async-commit behavior.
4. Add failing aggregation/maintenance specs, then extract/reuse the trace value
   summarizer without changing trace output. Build grouped measurement minute
   summaries and extend HistoryMaintenance to process every measurement,
   including detached ones. Reuse retention/grace constants and bounded work
   limits; make inserts idempotent and protect raw data until summarized.
5. Add request specs and implement API classes/controllers/routes. Test filters,
   ordering, limits, invalid attachment errors, immutable history and bounded
   batch preview queries. Mutation invalidations cover measurements and affected
   instance data. Keep samples/rollups read-only.
6. Add frontend tests, then Store types, Measurements navigation and tiled cards.
   Cover values including false/zero/null, timestamps, source labels, loading,
   empty/error states, detached history and labeled summary fallback.
7. Add frontend tests, then attach/create modal, explicit selection state,
   highlighted I/O targets and measurement dropdowns in InstancesTab. Cover
   create/select/reassign, multiple attachments, detach, Escape/Cancel/navigation,
   failed saves retaining recoverable state and ordinary binding controls.
8. Review implementation, refactor with tests green, run focused then full RSpec
   and frontend suites, TypeScript checking, production frontend build and
   diff whitespace checks. Inspect UI using existing screenshot.mjs/Playwright
   workflow when local dependencies permit; never use production port 3001 or
   start another poller. Stop any test-only servers started for this task.
9. Update overview and this document with implementation details and verification.
   No deployment in this task.

## Delegation and review

After plan approval, delegate bounded backend and frontend work to Terra/Luna
agents as required by AGENTS.md, with ownership boundaries to avoid concurrent
edits. Parent reviews migrations, history correctness, transaction locking,
maintenance and Store integration. Concurrency/lifecycle work requires close
parent review; escalate to Logan if implementation reveals unresolved design
or reliability limits.

## Critical regression cases

- Samples are immutable snapshots even after rename, deletion or reassignment.
- No historical backfill when attaching; no fabricated samples while detached.
- Same-minute source/type changes retain separate typed summary groups.
- Detach and evaluation races have an atomic ordering; no samples after a
  completed detach from an evaluation that starts later.
- Failed trace INSERT rolls back live-state and measurement writes together.
- Retention catches up after restart, remains bounded, preserves unrolled raw
  data, and expires rollups even for detached measurements.
- Existing trace summaries/retention, physical output gates and binding editing
  retain their current behavior.

## Implementation notes

- Backend and frontend were implemented by Terra agents and reviewed by the
  parent agent. Measurements use the polymorphic `source` relationship requested
  by Logan, with explicit source-class allowlisting and a complete attachment
  tuple constraint. Source moves also detach probes.
- Sampling locks measurement rows and bulk-inserts immutable snapshots in the
  trace transaction. Attachment changes and source lifecycle edits lock their
  dependencies in a consistent order. Samples and rollups do not publish record
  notifications; Measurement configuration changes do.
- Card previews use indexed lateral LIMIT 5 queries, batched across measurements.
  Raw points take precedence; rollups are fetched only for cards without raw.
- Maintenance shares trace retention constants and summarization code. An
  internal `rolled_up` sample flag protects unrepresented points from pruning;
  a partial index makes pending work efficient. Processing is bounded to 5,000
  samples and a 30-minute window per measurement per pass.
- Backdated trace creation can add points to an already summarized minute.
  Those points form additional summary groups marked `late: true`, displayed as
  additional samples. Original statistics stay intact; transitions are computed
  within each group, never invented between batches whose raw data has expired.
  Updated sample_count covers all represented points. These late points expire
  under the same retention policy after summarization.
- Selection uses an accessible full-row button with crosshair cursor and visible
  hover/focus state. The modal traps keyboard focus and restores it on close.

## Verification

### Revision: native measurement popover

Logan requested replacing the disclosure menu with a native popover. Plan:
use a button and `popover="auto"` panel so the browser handles outside-click
and Escape dismissal; retain upper-right placement and detach controls, anchor
the panel to the trigger, and verify existing component tests, TypeScript and
browser dismissal behavior. No API, schema or hardware changes.

Implemented with native `popover="auto"` and a button invoker. JavaScript only
positions the panel relative to its trigger; the browser owns visibility and
dismissal. Eleven instance tests and TypeScript checking pass. Playwright/Chrome
verified inside clicks stay open, outside clicks and Escape dismiss, and desktop
and mobile positioning stays within the viewport.

### Revision: measurement icon placement

Logan corrected the attached-measurement icon placement to the upper-right of
the I/O card, on the same row as the port title and separate from its value
controls, without a border or disclosure arrow. Implementation: use a full-width
header with the title at left and accessible dropdown at right, align the menu
to the right, suppress the native summary marker, and run the existing instance
component tests and typecheck.
This is an explicitly requested revision to the approved UX; schema, API,
retention and hardware behavior are unchanged.

- Measurement model/request/maintenance specs: 17 examples, zero failures.
- Full frontend suite: 87 tests pass; TypeScript checking and production build
  pass. RuboCop passes for measurement implementation/specs and modified history
  services; git diff --check passes.
- Full RSpec baseline had two failures in HostPorts API examples at
  `spec/requests/host_ports_spec.rb:76` and `:87`, caused by missing `/dev/ttyUSB0`
  on this Mac. Final full suite: 361 examples, the same two unrelated failures.
- Playwright with downloaded Chromium verified the actual built frontend against
  a temporary Rails API on port 3002 and a separate review database: five-point
  cards, modal creation, crosshair selection, sampling, detach and cross-type
  reattachment with preserved history. No page errors. Desktop/mobile screenshots
  were inspected; mobile navigation wrapping was corrected and overflow checked.
- Test-only API/static servers were stopped and the review database removed.
  No poller was started and no production service/database was touched.
