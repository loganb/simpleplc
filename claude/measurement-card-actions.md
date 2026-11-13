# measurement-card-actions

status: delete remains implemented; clear data removed locally.

## current design

each measurement card has a dropdown containing “Delete measurement…”. deletion
removes the measurement and its samples/summaries; it leaves its instance,
source port, and instance traces unchanged. confirmation names the measurement
and describes that consequence.

the trigger appears on card hover on fine-pointer devices, on keyboard focus
within the card, and while the menu is open. it stays visible on touch devices.
selection and menu controls are sibling buttons. menu clicks do not toggle graph
selection. keyboard navigation, escape, outside dismissal, focus restoration,
pending controls, and visible errors remain.

## schema and api

no migration or hardware changes. `DELETE /measurements/:id` locks the
measurement before dependent history deletion, serializing with sampling and
rollup maintenance. a successful delete returns 204; Store evicts the record
and query, and chart selection drops its series. maintenance tolerates a
measurement disappearing between enumeration and lock.

ordinary measurement PATCH accepts name and attachment fields only. clear_data
is no longer permitted or implemented. normal update invalidations cover
measurement queries and instance attachment records. all frontend server I/O
continues through Store.

## safari pointer handling

safari can blur the focused menu item during a pointer press before click.
the card must not dismiss its menu during that internal press. the pointer
guard resets on pointerup/cancel; keyboard focus departure and outside pointer
dismissal retain their existing behavior. the fix was verified in local safari
before removal of clear data and remains relevant to deletion.

## retained tests

existing coverage checks delete cascade without removing the instance/traces,
maintenance concurrency, confirmation cancellation, menu selection isolation,
keyboard/focus behavior, pending repeat prevention, and visible delete failure.
clear-specific request, frontend, and history-reset tests are removed. no new
negative tests are added, per user instruction.

## deployment history

the original clear-and-delete feature deployed at `598deba` on 2026-11-10.
on the deployment Pi, the full RSpec suite passed 389 examples; the full
frontend suite passed 123 tests, and typecheck/build passed. no migration was
required. see `claude/deployment.md` for those service and fresh-poll checks.

clear data was subsequently withdrawn by user request. the local removal and
its validation are documented in `claude/remove-measurement-clear.md`.
