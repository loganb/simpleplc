# Instance History

Status: design agreed 2026-10-13; steps 1-9, the code part of 10, and local verification of 11 are implemented (uncommitted, undeployed). Still to do on the Pi: the step 10 baselines/measurements and the production deploy (needs approval).

Implementation notes: the rollup builder is `Logic::TraceRollupBuilder`; maintenance is `Logic::HistoryMaintenance`; async commit is `ApplicationRecord.async_commit_transaction`. State rows are created lazily on an instance's first evaluation (the migration backfills only instances that already have traces).

## Design

### Goal

Run LogicInstances at 1 Hz and keep their history for debugging and graphing
without unbounded disk growth. The poller moves to about 1 s as well, so inputs
and relay writes keep up with the faster logic.

### Why the current design doesn't scale

- `traces` is both the runtime state and the history. Retained block state is
  recovered by `BlockEvaluator#previous_result`, which loads **every** trace
  for the instance into Ruby (`relation.find { }`) for each block on every
  tick. The poller and binding APIs find current outputs through `latest_trace`.
- `traces` has no `(logic_instance_id, recorded_at)` index.
- `TraceEvaluator` inserts the trace, then calls `update!` on it: two writes,
  a dead tuple and a record-change NOTIFY on every tick.
- Measured size is about 1 KB of JSONB per trace, about 1.4 KB per row on
  disk. At 1 Hz that's about 120 MB/day per instance; kept forever, about
  44 GB/year.
- Write-on-change was considered and rejected. Thermal probe readings and
  timer-counter elapsed time change on almost every tick, so it would save
  little.

### Live state, separate from history (option A)

New table `logic_instance_states`, one row per LogicInstance (`has_one`):

| column | notes |
| --- | --- |
| `logic_instance_id` | unique, FK |
| `recorded_at` | time of the evaluation that produced `results` |
| `results` | jsonb, same schema-v2 shape as `Trace#results` |

- The runner updates this row in place on every evaluation. Block state,
  `latest_result` and the `due?` check all read from it. Nothing on the hot
  path scans `traces`.
- It is a separate table, not a column on `logic_instances`. A column would
  bump the instance's `lock_version` (and send a NOTIFY) every second, and
  operator edits in the Instances tab would get 409 conflicts against the
  runner.
- No `lock_version` and no `ObservesRecordChanges` on this table. The runner
  writes it while holding a row lock (`SELECT … FOR UPDATE`), so a web-side
  "Compute now" and the runner's tick evaluate one after the other, not
  concurrently.
- `LogicInstance#result_for`, `LogicOutputBinding#latest_result`, and
  `LogicInputBindingApi#latest_value` read the state row.
- Changing an instance's diagram clears its state row, traces and rollups.

### History tiers (option C)

**Raw: `traces`, kept 48 h.** A full trace row is written once per evaluation
by a single INSERT, with the results already computed. The stored data is
unchanged for now; trimming names and per-entry `input_values` is option D,
deferred. Add an index on `(logic_instance_id, recorded_at)`. At steady state
this is about 240 MB per instance, plus dead space reused after vacuum.

**Rollups: `trace_rollups`, 1-minute buckets, kept 2 years.**

| column | notes |
| --- | --- |
| `logic_instance_id` | FK |
| `bucket_start` | minute-aligned timestamptz; unique with instance |
| `sample_count` | raw traces in the bucket |
| `results` | jsonb, `schema_version` + the same three buckets keyed by source id |

Rollups store only values; block state is not rolled up. For each source:

- number: `min`, `max`, `mean`, `last`, `count` (non-null samples)
- boolean: `true_fraction`, `transitions`, `last`, `count`
- `null_count` for both. A source that is null for the whole minute has only
  `null_count`.

About 1–2 KB per row, so about 2 MB/day, or about 1.5 GB per instance over
2 years. Option D would shrink this too.

### Maintenance (rollup + pruning)

This runs inside the existing LogicRunner, which already holds the
single-runner advisory lock, about once a minute between evaluations:

1. **Roll up.** For each instance, build every complete minute after its newest
   rollup and older than `now − 1 min` (a grace period for late writes),
   using the raw traces for that minute. This works from raw data rather than
   in-memory accumulators, so it survives restarts and catches up any minute
   still inside the 48 h raw window.
2. **Prune raw.** Delete traces older than 48 h, in batches (e.g. 5,000 rows
   per statement) so a backlog doesn't become one big delete. Never delete a
   minute that hasn't been rolled up yet.
3. **Prune rollups.** Delete rollups older than 2 years, also in batches.

The retention periods are constants for now. Partitioning traces by day
(option E) is the next step if DELETE plus autovacuum turns out to be heavy on
the Pi.

### Runner scheduling at 1 Hz

`due?` currently checks every second with `recorded_at + period <= now`. With
a 1 s period, any per-cycle delay pushes ticks to every 2 s. The runner will
track each instance's next due time (`previous due + period`, skipping ahead,
without catching up, after a stall) and sleep until the earliest one. Missed
intervals are still not backfilled. `update_period` stays an integer with a
minimum of 1 s.

`EvaluationContext#identifier_value` runs two `find_by` queries per identifier
per evaluation. Index the diagram's blocks and inputs by name once per
evaluation.

### Poller at about 1 s

- Make `POLL_INTERVAL` 1 s. Log a warning when a cycle overruns.
- Before changing it, measure actual cycle time on the production bus
  (N4D8B08 relay board at 9600 8N1, plus the WJ150 and N4DSC08 when present).
  Each Modbus transaction is roughly 20–40 ms at 9600 baud, and the poller
  currently writes **every** enabled output on every cycle. If the cycle
  doesn't fit in 1 s, only write outputs whose read-back state differs from
  the desired value.
- `persist_observation` will update each device row (and send a NOTIFY) every
  second. That's acceptable; noted in case UI churn shows up.

### SD card write reduction

Production Postgres is on the Pi's SD card. At 1 Hz, card wear comes mostly
from per-commit WAL flushes (each one rewrites an 8 KB WAL page), not from
history volume. An estimated ~4 commits/s (runner plus one per device in the
poller) is about 3 GB/day of host writes from flushes alone. Two changes:

- **`synchronous_commit = off` for the runner and poller only.** Set
  per-transaction (`SET LOCAL synchronous_commit = off`) in the runner's
  evaluation/maintenance transactions and the poller's observation
  transaction, so the WAL writer flushes in batches about every 200 ms
  (`wal_writer_delay`). A power cut can lose the last fraction of a second of
  traces/readings and never corrupts anything. Web-request writes (operator
  edits, "Compute now") stay synchronous. The record-change NOTIFY still
  goes out at commit, as before.
- **One poller transaction per cycle.** Serial IO stays outside any
  transaction, so operator edits to device and interface rows never wait on
  the bus. Each cycle buffers its device `current_state` observations and
  interface `report_connection` reports, then writes them all in one
  transaction at the end. Each record keeps its `identity` check and
  stale-retry logic inside its own savepoint (`transaction(requires_new:
  true)`), so one stale or invalid record is logged and skipped without
  rolling back the others. Rare writes stay where they are: scans,
  `relocate`, and shutdown's offline reports.

Deferred, by Logan's choice: Postgres tuning for long checkpoint intervals
(`checkpoint_timeout`, `max_wal_size`, `wal_compression`), and moving the data
directory off the SD card.

### API

- `TraceApi#by_query` gains `since` / `until` (`recorded_at` range). The
  existing limit cap stays.
- New read-only `TraceRollupApi` with `logic_instance_id`, `since`, `until`.
- "Compute now" (`POST /traces`) keeps working: it evaluates against the
  locked state row and writes a trace like the runner does.
- The graphing UI is a separate task. This one provides the data and the
  query API.

### Out of scope

- Trimming the raw trace format (option D).
- Partitioning (option E).
- History charts in the frontend.

## Implementation plan

1. **Index + single-write traces.** Migration adding the
   `(logic_instance_id, recorded_at)` index. Rework `TraceEvaluator` so it
   computes results first and then inserts once (no after_create
   `update!`). Specs stay green.
2. **Live state table.** Migration creating `logic_instance_states` and
   backfilling one row per instance. The backfill takes the latest trace's
   results and fills in, from older traces, any block result that the latest
   trace lacks (what `previous_result` does today). Add the model and
   `has_one`, and lock the row during evaluation.
3. **Read from state.** Point `BlockEvaluator` previous state,
   `LogicInstance#result_for`, the binding latest values, and the runner's
   `due?` at the state row. Delete `previous_result`'s trace scan. Clear
   state on a diagram change.
4. **Runner scheduling.** Next-due-time scheduling and sleep-until-earliest.
   Cache identifier lookups in `EvaluationContext`.
5. **Rollups.** Migration for `trace_rollups`. Add a `Logic::TraceRollup`
   builder (pure aggregation over a set of traces, unit-tested) and a
   runner maintenance step for catch-up rollups.
6. **Retention.** Batched pruning of raw traces and rollups in the
   maintenance step, guarded so an un-rolled-up minute is never deleted.
7. **API.** Time-range params on `TraceApi`, plus `TraceRollupApi` and its
   route and frontend store model.
8. **Async commit in the runner.** `SET LOCAL synchronous_commit = off` in
   the runner's evaluation and maintenance transactions only. A spec asserts
   that web-initiated traces still commit synchronously.
9. **Poller batching + async commit.** Buffer device observations and
   interface reports during the cycle, then persist them in one asynchronous
   transaction with a savepoint per record. Specs cover one stale record not
   blocking the rest, and a mid-cycle connection error still recording the
   offline report.
10. **Poller rate.** Before deploying the rate change, record a 24 h
    baseline of card writes (`/sys/block/mmcblk0/stat` field 7) and
    `pg_stat_wal`. Add cycle-time logging and measure on production at the
    current 10 s interval. Then set 1 s, adding write-only-on-difference if
    the measurement needs it. Repeat the 24 h write measurement afterwards.
11. **Verify.** RSpec, frontend tests/typecheck/build. In dev, run the API
    only (no second poller) and confirm the runner sustains 1 Hz, rollups
    appear each minute, and pruning holds the trace count near 48 h × 3,600.
    Update `claude/overview.md`. Production deploy only with approval.
