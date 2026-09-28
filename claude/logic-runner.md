# Logic Runner

## Design

Add a dedicated Rails daemon, `LogicRunner`, that creates `Trace` records for
each `LogicDiagram` according to the diagram's `update_period`. It runs
asynchronously alongside the device poller. The runner computes desired state
only; it never opens a serial port or writes hardware. The existing poller
remains the sole hardware owner and applies enabled, non-null output values from
the latest completed trace on a later poll cycle.

### Scheduling semantics

- Treat `LogicDiagram#update_period` as seconds.
- A diagram with no traces is due immediately.
- Otherwise it is due when the newest trace's `recorded_at + update_period` is
  at or before the current time.
- Re-read diagrams and their latest traces each scheduler pass so diagram
  creation, deletion, manual trace creation, and update-period edits take effect
  without restarting the daemon.
- Create at most one trace for a diagram in one pass. Do not backfill every
  missed interval after downtime; resume with one current computation and
  schedule forward from it.
- A manually created trace resets the same schedule because it becomes the
  diagram's newest computation.
- Use the time at which the scheduled evaluation begins as `recorded_at`.
- Check for due work once per second. This bounds scheduling lateness without
  busy-waiting; diagram periods remain independently configurable.

The runner and poller intentionally do not synchronize. A trace may snapshot
the device state from the previous poll, and its desired outputs may not reach
hardware until the next poll. Tighter read/compute/write coordination is
deferred.

### Process behavior

- Follow the poller's daemon shape: an autoloadable service class plus a thin
  `bin/logic_runner` entrypoint that loads the Rails environment.
- Wrap scheduler passes in `Rails.application.reloader.wrap` for development.
- Handle `INT` and `TERM` by setting a stop flag and leaving the loop cleanly.
- Isolate failures per diagram: log the diagram ID/name and exception, continue
  evaluating other due diagrams, and delay retrying the failed diagram so a
  persistent error cannot create a one-second log/CPU storm.
- Prevent two logic-runner processes against the same PostgreSQL database from
  scheduling duplicate traces by holding one session-level advisory lock for
  the daemon lifetime. Failure to obtain the lock should be reported clearly
  and terminate the duplicate process.
- Recheck that a diagram is still due immediately before creating its trace.
  This narrows races with manual trace creation. Full serialization between
  arbitrary manual and scheduled trace creation is deferred unless a failing
  spec demonstrates that it is required.

### Existing output handoff

Creating a trace invokes `Logic::TraceEvaluator` through the `Trace`
`after_create` callback. The evaluator snapshots Measurements from persisted
device observations, evaluates LogicBlocks in stratum order, evaluates
OutputBlocks, and stores the complete result document on the trace.

At the beginning of a poll cycle, `Logic::OutputWriter` reads each enabled
OutputBlock's result from its diagram's latest trace. It emits a command only
when both diagram-level and output-level enables are true and the desired value
is non-null. After reading a device, the poller writes the collected commands
through its existing driver: true calls `open(channel)` and false calls
`close(channel)`. Disabled and null outputs do not alter hardware.

### Process configuration

- Add `logic_runner: bin/logic_runner` to `Procfile.dev` so Foreman starts it
  with the API, frontend, and poller.
- Add a production `plc_controller-logic-runner` systemd service using the same
  application directory, environment file, user, restart policy, and mise
  runtime conventions as the current poller service.
- Make the service part of `plc_controller.target` and document the third
  process in the deployment notes. Production installation/restart remains a
  deployment action, not part of the code change.

## Alternatives considered

- **Evaluate inside the poller after device reads.** This gives a tighter
  read/compute/write sequence, but couples control scheduling to every serial
  bus and lets slow or failed hardware delay unrelated diagrams. The requested
  independent daemon is simpler and preserves exclusive hardware ownership.
- **Use Active Job/Solid Queue recurring tasks.** The application currently has
  no job workload, and per-diagram mutable schedules would add queue scheduler
  configuration for a small loop. A dedicated supervised process matches the
  existing poller architecture better.
- **Persist `next_run_at`.** This could support atomic multi-runner claiming and
  explicit schedule phase, but adds database state and update semantics that
  are unnecessary while the newest trace already supplies the scheduling
  cursor.

## Implementation plan

Implementation will use red-green-refactor and will not begin until this plan
is confirmed.

### Red

1. Add `spec/services/logic_runner_spec.rb` covering:
   - immediate evaluation of a diagram without a trace;
   - waiting until `update_period` has elapsed;
   - independent schedules for multiple diagrams;
   - one current trace rather than backfilling missed intervals;
   - a manual/newer trace postponing the next scheduled evaluation;
   - update-period changes and newly created/deleted diagrams being observed;
   - one diagram failure not preventing another from running;
   - failed-diagram retry throttling;
   - graceful stop behavior without testing an endless real-time loop;
   - refusal to run concurrently when the database advisory lock is held.
2. Add an integration-level example proving a runner-created trace feeds the
   existing `Logic::OutputWriter` command path. Keep actual driver writes in the
   existing poller/output-writer specs rather than duplicating them.

### Green

1. Implement `LogicRunner` with a small public `run_cycle` unit and a `run`
   loop for scheduling, signal handling, retry bookkeeping, and the singleton
   PostgreSQL advisory lock.
2. Reuse `Logic::DiagramEvaluator.evaluate!` to create scheduled traces rather
   than duplicating trace/evaluation behavior.
3. Add the executable `bin/logic_runner` entrypoint.
4. Add the process to `Procfile.dev`.
5. Add/version the production systemd service definition using the established
   deployment conventions, then update `claude/deployment.md` with installation
   and supervision details. Do not deploy or restart production without
   separate authorization.
6. Update `claude/overview.md` to describe the implemented scheduler and the
   asynchronous database handoff to the poller.

### Refactor

1. Keep clock and sleep dependencies injectable enough for deterministic specs
   without introducing a general scheduler abstraction.
2. Extract advisory-lock handling only if it materially obscures the runner
   loop or duplicates an existing project primitive.
3. Keep scheduling separate from `TraceEvaluator`; diagram computation should
   remain usable through both the API and the daemon.

## Verification

- `mise exec -- bundle exec rspec spec/services/logic_runner_spec.rb`
- `mise exec -- bundle exec rspec`
- Start the development Foreman stack and confirm the runner creates traces at
  configured periods while the poller consumes their latest output results.
- Before any authorized production rollout, validate the systemd unit, daemon
  status, logs, trace cadence, and continued poller health.

## Confirmation

Task name `logic-runner` and asynchronous operation relative to the poller were
confirmed by the user. The implementation plan was confirmed on 2026-09-28;
implementation proceeded from that confirmation.

## Implementation notes

- Added `LogicRunner`, which checks once per second and creates one current
  trace for each due diagram. It reloads each diagram immediately before its
  due check, observes runtime configuration changes, and never backfills missed
  intervals.
- Failed evaluations are isolated per diagram and retried after ten seconds.
- The daemon holds PostgreSQL advisory lock `(78125, 1)` for its lifetime, so a
  second runner against the same database exits with `AlreadyRunning`.
- Added the executable `bin/logic_runner`, the `logic_runner` Foreman process,
  and versioned systemd runner/target definitions under `config/systemd/`.
- Added RSpec coverage for scheduling, dynamic changes, failure isolation,
  retry throttling, shutdown, singleton locking, and the handoff into
  `Logic::OutputWriter`.
- Production deployment is recorded below. The current development Foreman
  session still needs a restart before it will launch the new Procfile process.

Verification on 2026-09-28:

- `mise exec -- bundle exec rspec spec/services/logic_runner_spec.rb`: 11
  examples, 0 failures.
- `mise exec -- bundle exec rspec`: 196 examples, 0 failures.
- `mise exec -- bundle exec rubocop app/services/logic_runner.rb
  spec/services/logic_runner_spec.rb bin/logic_runner`: no offenses.
- A real PostgreSQL test-database smoke check acquired and released the runner's
  advisory lock successfully.
- Ruby syntax checks and `git diff --check` pass.

## Production deployment

Deployed commit `99f43b7` on 2026-09-28. Installed the versioned logic-runner
service and target definitions, reloaded systemd, and restarted
`plc_controller.target`. Web, poller, logic runner, and target are active with
zero service restarts; `/up` returns HTTP 200. The production diagram created
traces at three consecutive 30-second boundaries, and subsequent device polls
were fresh and successful with no output-write errors. Production deployment
details are also recorded in `claude/deployment.md`.
