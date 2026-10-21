# Instance Measurements

Status: implemented locally 2026-10-21; not deployed. Logan confirmed two-year rollup retention,
value-only history, and computed logical values for measured outputs, including
outputs used only for measuring.
This feature is unrelated to the former input records named Measurements,
which were replaced by LogicInputs.

## Design

### Measurement and current source

A Measurement is an independent named time series with optional units. Its
current source is either absent (detached) or one LogicInput or LogicOutput
port as evaluated in one LogicInstance. The selected port must belong to the
instance's current LogicDiagram. A Measurement may be detached and attached
to a different port, including a port on a different instance. Deleting a
port, instance, or diagram automatically detaches affected Measurements;
changing an instance's diagram does the same. Measurements and their recorded
values survive those operations.

Use a `measurements` table for durable identity and a `measurement_sources`
table for the optional *current* source. Each Measurement has at most one
source row, with `logic_instance_id` and exactly one of `logic_input_id` or
`logic_output_id`. Foreign keys and deletion behavior remove the source row
if the instance or port disappears. This is not a source history table. Two
Measurements may attach to the same port if desired.

History stores only timestamped values. Renaming or editing a port, detaching,
or changing source does not rewrite prior samples or create a label period.
The chart treats all recorded values as one Measurement series. Historical
source provenance cannot be recovered reliably from this version's data and
can be designed separately later.

### Recording and retention

On each evaluation of the attached instance, write one `measurement_samples`
row per attached Measurement. The row stores its Measurement ID,
`recorded_at`, and numeric/boolean/null value. For an input, take
`results.logic_inputs[input_id].value` after the input binding has been
sampled; an unbound or unavailable input yields null. For an output, take
`results.logic_outputs[output_id].value`, the computed logical output even
when the physical output is unbound or disabled. Logan confirmed this value
choice. Source edits must be serialized with sampling so
each evaluation uses a consistent current source. Insert samples in the same
transaction as the instance state update and Trace insert. Both scheduled
evaluations and "Compute now" record values; failed evaluations record none.
Detached Measurements record nothing. No Measurement history query reads
traces or trace rollups.

Raw samples remain 48 hours. A separate `measurement_rollups` table holds
one-minute summaries for two years. As with traces, complete minutes are
rolled up after a one-minute grace period, and raw rows are pruned only when
their rollup exists. Numeric summaries contain min/max/mean/last/count;
boolean summaries contain true_fraction/transitions/last/count; both count
nulls. A source change within a minute can put values from two ports in one
bucket; this is intentional for a value-only series. If a Measurement changes
between numeric and boolean values, preserve both types in the rollup instead
of dropping either. Detached Measurements still receive retention maintenance.

At 1 Hz an attached Measurement adds one sample row per evaluation (about
172,800 raw rows over 48 hours). Batch inserts per evaluation and benchmark
database and SD-card write cost before deployment.

### API and user experience

Measurement CRUD follows the REST resource convention. Source selection and
detachment are fields patched on the Measurement resource, not verb endpoints.
Validation requires a compatible instance/port pair or no source. A focused
read-only history resource returns bounded exact or aggregate points from the
Measurement tables, with requested time range and precision. All frontend I/O
goes through RestfulModelStore.

The Measurements page lists named Measurements and their *current* source,
with controls to create, rename, attach, reattach, detach, and delete. It
graphs one Measurement at a time across its retained history. A short zoom
inside 48 hours shows exact values; wider views use rollups and a point budget.
The chart distinguishes exact values from aggregates, shows null or missing
intervals as gaps, and does not claim historical source labels. Deleting a
Measurement itself deletes its samples and rollups.

In the Instances view, show a small measurement-themed icon (for example, a
sparkline glyph) directly beside the name of each input or output port that
has at least one currently attached Measurement on that instance. Give it an
accessible label such as "Measured" and make it a link to the Measurements
page filtered to that instance port (which may have multiple Measurements).
The indicator is instance-specific:
the reusable Logic diagram editor does not show it, because another instance
of the same diagram may not measure that port. An icon should appear even when
the port has no device binding, since the logical port can still be measured.

### Alternative considered

Extracting values from traces would save writes but would tie Measurement
history to deleted instances and 48-hour trace retention. Independent sample
and rollup tables preserve Measurement history across source changes.

### Confirmed value choice

A measured output stores `results.logic_outputs[id].value` even when output
enable is off or no device output is connected. Outputs may exist solely for
measuring.

## Implementation plan (written before code changes)

1. Add failing RSpec model/request examples for Measurement CRUD, input/output
   source validation, detach/reattach, survival of port/instance/diagram
   deletion or instance diagram change, and cascade deletion only when the
   Measurement itself is deleted. Add tables, constraints, models, API,
   routes, and resource mappings; make the examples pass.
2. Add failing RSpec examples for input/output values on scheduled and manual
   evaluations, null and boolean values, disabled/unbound outputs, multiple
   Measurements on one port, source changes racing evaluation, and rollback
   on evaluation failure. Insert samples from evaluated results in the same
   transaction; make the examples pass.
3. Add failing RSpec examples for one-minute rollups, mixed values/source
   changes within a minute, catch-up after downtime, 48-hour raw retention,
   two-year rollup retention, and protection when rollup is behind. Implement
   bounded maintenance and make the examples pass.
4. Add request examples for bounded exact and aggregate history queries.
   Implement a read-only history resource using Measurement tables only,
   including server-side display aggregation for long ranges; verify cost.
5. Add failing frontend tests for source selection, attach/detach/reattach,
   the measured icon beside instance port names, its accessible label and
   navigation, and chart gaps and precision. Add store models, Measurements
   tab/UX state, and chart components. Keep all I/O in RestfulModelStore.
6. Refactor after tests pass; run RSpec, frontend tests, typecheck, and build.
   Verify in Playwright using a separate development Rails port and no second
   poller. Measure insert overhead, query latency, and payload sizes. Update
   `claude/overview.md` with the implemented behavior and verification.

Confirmation: Logan confirmed the revised plan and output value choice on
2026-10-21 before application code changes, as requested by `AGENTS.md`.

## Handoff for the implementing agent

This section is the current task brief. The design above is approved. A local,
uncommitted implementation already exists in this shared checkout; inspect and
finish it rather than starting over or reverting it. Do not confuse this
feature with the old input-record use of the name Measurement. Preserve
unrelated user edits, including those in `claude/deployment.md` and
`claude/instance-history.md`. Read `AGENTS.md`; do not start another poller,
use production port 3001, or use system Chromium for browser checks.

### Acceptance criteria

1. A named Measurement with optional units exists independently of any
   diagram, instance, port, trace, or binding. It has zero or one current
   source: one input **or** output port in one instance of that port's diagram.
   Two Measurements may use the same source. A detached Measurement records
   nothing and remains available with all its history.
2. Editing a source port's name or logic, reattaching the Measurement to a
   different instance/port, or detaching it never rewrites old values. Deleting
   a source port/instance/diagram, or changing an instance's diagram, detaches
   the Measurement automatically. Deleting the Measurement deletes its own
   history. No historical source labels or periods are stored.
3. Every successful instance evaluation records one timestamped numeric,
   boolean, or null value per attached Measurement, in independent tables and
   the same transaction as the Trace and live-state update. A failed
   evaluation commits none. The input value is the evaluated/sampled logical
   input. The output value is the **computed logical output**, regardless of
   output-enable state or physical binding; an output may exist only to be
   measured. Both the scheduled runner and Compute now use this path.
   Concurrent source changes must have an unambiguous before/after outcome,
   without partial writes or deadlocks.
4. Keep exact samples for 48 hours. Roll complete minutes up after a one-minute
   grace; retain rollups for two years. The rollup counts nulls and retains
   numeric min/max/mean/first/last/count and boolean true fraction/transition
   count/first/last/count. Mixed types within a minute retain both summaries.
   Catch-up work is bounded and old raw data is pruned only after its rollup
   exists. Detached Measurements still receive retention maintenance.
5. CRUD uses `/measurements` and flat `logic_instance_id`, `logic_input_id`,
   `logic_output_id` fields. Set all three to null to detach. Invalid
   instance/port combinations are rejected. History uses read-only
   `/measurement_series` with `measurement_id`, `since`, `until`, and
   `max_points` query fields. Exact points carry `recorded_at`,
   `precision: "exact"`, and `value`; aggregate points carry `recorded_at`,
   `precision: "rollup"`, `interval_seconds`, `sample_count`, and `stats`. A long query
   must remain bounded in result size and database work, including recent raw
   tail data. Neither API nor UI reads Trace history for Measurement values.
   Follow the repository's REST resource pattern; do not add verb endpoints.
6. The Measurements tab supports create, rename, attach, reattach, detach,
   delete, and time navigation through retained history. Graph numeric and
   boolean values, identify exact versus aggregate values, and show null or
   missing intervals as gaps. In the Instances view, an accessible sparkline
   icon appears beside each measured input/output name for the selected
   instance, including unbound ports. Activating it opens Measurements
   filtered to that instance port. The reusable Logic editor stays
   instance-independent. All frontend server I/O uses `RestfulModelStore`.

### Current code and remaining review

- Migration and schema: `db/migrate/20261021000000_create_instance_measurements.rb`
  and `db/schema.rb`. Models: `Measurement`, `MeasurementSource`,
  `MeasurementSample`, `MeasurementRollup`, and `MeasurementSeries`.
- Recording: `Trace#after_create` invokes
  `Logic::MeasurementRecorder`; `Logic::HistoryMaintenance` invokes
  `Logic::MeasurementHistoryMaintenance`. Review lock ordering and source
  changes during evaluation. `MeasurementApi#update` uses `FOR NO KEY UPDATE`
  to allow the sample insert's parent foreign-key check while it holds a
  source lock.
- Reading: `MeasurementSeriesApi` and `Logic::MeasurementSeriesBuilder`.
  Check exact/aggregate boundaries, missing intervals, and query cost for
  large ranges. A regression spec now verifies that aggregate points plus
  the recent exact tail obey `max_points`.
- UI: `frontend/src/tabs/measurements/MeasurementsTab.tsx`,
  `frontend/src/tabs/instances/InstancesTab.tsx`, store definitions, and
  `frontend/src/uxTree.ts`. Review create/edit/detach navigation and chart
  behavior with tests; existing frontend tests cover only creation on an
  unbound output and initial icon visibility.
- Existing RSpec tests cover lifecycle, values, rollback, retention, exact
  and aggregate queries, and the combined point budget. Add focused tests for any uncovered
  acceptance case that reveals a real risk, especially concurrent edits,
  scheduled/manual evaluation paths, broad-query point bounds, and UI
  detach/reattach and chart gaps. Use red-green refactoring.
- Before calling the feature ready for production, measure insert overhead,
  history query latency/payload size, and likely WAL/SD-card cost at expected
  Measurement counts. There is no authorization in this note to deploy.
  Keep `claude/overview.md` and this note current with findings.

The existing local implementation passed the suites listed below. Treat that
as a baseline, not proof that the remaining review items are complete.

## Verification

- Full RSpec suite: 328 examples, 0 failures after rebuilding the disposable
  test database from `db/schema.rb`. The development database had an obsolete
  unique output-binding index absent from tracked migrations and schema; it
  was excluded from the new schema dump.
- Frontend Vitest: 65 tests passed; TypeScript check and production build
  passed. Browser flow used Rails only on port 3002 and a static frontend on
  port 5199, with no second poller. It created a Measurement on an unbound,
  disabled output, computed once, displayed its port icon and exact `false`
  chart point, and removed the temporary Measurement afterward.
- Migration applied to the development database for browser verification; a
  running development Rails process may need a restart to load the new code.
  Production was not migrated or deployed. Insert throughput and SD-card/WAL
  cost still need measurement before production deployment.
