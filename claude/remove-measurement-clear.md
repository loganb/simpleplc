# remove-measurement-clear

status: implemented and reviewed locally; not committed or deployed.

user clarification: remove clear-specific tests only; add no negative tests.
existing shared menu and safari tests may be adapted to the remaining delete action.

## design

remove clear data completely. keep the measurement card dropdown with delete
measurement, its confirmation, pending/error handling, accessibility, and the
safari pointer-focus fix. deleting a measurement still deletes its samples and
rollups without deleting its source, instance, or instance traces. no existing
data is changed by this implementation.

## implementation plan

1. resolve the existing documentation conflicts in measurement-card-actions.md
   and overview.md, preserving deployment history and describing the final
   delete-only design. do not advance/abort the ongoing git rebase.
2. delegate implementation to luna and review its work. remove clear-only
   tests without adding negative tests. adapt existing safari,
   confirmation cancellation, keyboard, pending, and failure tests to delete.
3. remove the clear menu item, confirmation, mutation, clear callbacks and
   reset token wiring; simplify action-specific transaction state/error text.
4. remove MeasurementPatchFields and backend clear_data permit/deletion logic.
   restore ordinary update invalidations to measurement queries and instance
   records. keep deletion locks and maintenance concurrency handling.
5. remove the history hook's clear-only reset token, request generation and
   forced timestamp machinery; retain normal refresh, query-key race guards,
   selection/range changes, and retained snapshots during background refresh.
6. remove clear-only request specs; retain attachment and delete specs.
   remove clear-only hook tests and update documentation to mark clear removed.
7. run frontend tests, typecheck/build, and measurement request/service rspec
   where database access permits; report any environment restrictions.

## schema and api

no schema changes. PATCH /measurements/:id no longer permits clear_data;
unknown fields follow existing strong-parameter behavior. DELETE is unchanged.

## ux and hardware

menu retains only delete measurement. no hardware, poller, or production actions.

## tests

- retain existing menu selection-isolation and delete tests.
- cancel sends no request; confirm uses Store.destroy; failure remains visible.
- duplicate delete is disabled while pending; successful deletion evicts card.
- safari pointer focus, keyboard arrows/escape and outside dismissal still work.
- ordinary rename/attachment updates, delete cascade and history refresh/race
  protection still work.

## current checkout

an interactive rebase is paused applying the safari fix, with conflicts in
claude/measurement-card-actions.md and claude/overview.md. the ruby upgrade is
next in its todo. resolve relevant working-file conflicts but leave git history
operations alone; .git remains read-only in this session.

## implementation and validation

removed the clear menu item, mutation/confirmation, write-only PATCH field and
type, extra history invalidations, and reset-token/generation/timestamp plumbing.
kept the delete dropdown, confirmation/errors/pending state, safari pointer
guard, deletion locking, and maintenance concurrency handling. no schema or
hardware changes.

removed three clear-specific request specs, three clear-specific frontend
tests, and the reset hook test. adapted existing shared menu tests to delete;
no new tests or negative assertions about the removed feature were added.

- full frontend suite: 121 tests across 18 files passed.
- focused measurement frontend suite: 20 tests passed.
- TypeScript check and production build passed.
- ruby syntax checks passed for measurement_api.rb and measurements_spec.rb.
- request/service RSpec could not start: postgres socket access denied by
  sandbox (`/tmp/.s.PGSQL.5432`, Operation not permitted).
- no feature references remain under app, frontend/src, or spec.
- resolved documentation conflict markers in working files, retaining original
  deployment history. git index still records the conflicts and the existing
  rebase remains paused; no git history operations were performed.
