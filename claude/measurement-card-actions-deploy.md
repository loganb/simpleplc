# Measurement card actions deployment

## Design

Deploy GitHub `main` commit `598deba`, which adds card menus for clearing a
measurement's history and deleting a measurement. Keep production's existing
database and hardware settings. The user authorized pulling and deploying the
new GitHub code on 2026-11-10.

## Plan (before code changes)

1. Inspect the new commit's API, deletion path, frontend behavior, and tests.
   Confirm no migration, toolchain, or hardware change is needed.
2. Fast-forward the clean development `main` branch to `origin/main`.
3. Run focused RSpec and frontend tests for the new actions, then the full
   suites and build if focused checks pass. Do not start another poller or send
   test requests to production port 3001.
4. Deploy the exact reviewed commit with `bin/deploy <sha>` and verify service
   status and fresh production records through read-only local observations.
5. Record the outcome here and in `claude/deployment.md`; update the project
   overview if the feature description needs it.

## Change surface

- Schema: none.
- API: measurement delete and history-clear field mutation; review exact
  semantics in the commit.
- UX: measurement card menus, confirmations, and refreshed history display.
- Hardware: no direct hardware changes; production services restart normally.
- Tests: request specs, measurement-history service specs, card and hook tests,
  plus the existing RSpec/frontend suites.

## Result

Fast-forwarded local `main` to `598deba` and deployed that exact commit on
2026-11-10. The full RSpec suite passed 389 examples; the frontend suite
passed 123 tests, and TypeScript checking and production build passed. The
deploy had no migration. The target, web, poller, and logic runner were active
with zero service restarts after deployment. The RS-485 interface was online
with a fresh heartbeat, and devices 3–6 resumed fresh `ok` polls. No requests
were sent to production port 3001.
