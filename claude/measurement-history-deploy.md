# Measurement history deployment

## Design

Deploy the latest `origin/main` measurement history and graph changes while
retaining the RS-485 quiet-gap fix currently running in production at `452bdc8`.
Keep the dirty development checkout unchanged. Production uses the detached
worktree at `/opt/plc_controller/current` and is restarted through `bin/deploy`.

## Plan (before code or production changes)

1. Fetch and review `origin/main`, the deployed commit, migrations, and service
   state. Confirm the production worktree has no source edits.
2. In a separate temporary worktree, apply `452bdc8` on top of `origin/main`.
   Resolve only any actual conflict, then inspect the resulting diff.
3. Run focused RSpec for measurement history and the bus quiet gap, plus the
   frontend tests and build. Do not start another poller or test port 3001.
4. Deploy the resulting commit with `bin/deploy <sha>`, which installs
   dependencies, builds static assets, applies the production migration, and
   restarts the service target.
5. Check service state and production data through local service/database
   observations. Do not send test requests to production port 3001.
6. Record the deployed commit and verification in `claude/deployment.md` and
   update `claude/overview.md` for the new measurement feature.

## Change surface

- Schema: new measurements, measurement samples, and minute rollups.
- API: measurement CRUD and read-only history endpoints.
- UX: measurements tab, instance attachment controls, and history graph.
- Hardware: retain the existing 50 ms RS-485 quiet gap and synchronized poller
  stdout; no new hardware reads or writes from measurement history.
- Tests: measurement model/request/maintenance specs, bus quiet gap spec, and
  frontend measurement tests, then relevant full suites if focused checks pass.

## Result

Cherry-picked `452bdc8` onto GitHub `main` as `50b09c3`, pushed it to
`origin/main`, and deployed `50b09c3`. The full RSpec suite passed 384 examples;
the frontend suite passed 117 tests, and typecheck/build passed. The production
migration completed. All services are active, the bus is online, and devices
3–6 have fresh `ok` polls. See `claude/deployment.md` for verification.
