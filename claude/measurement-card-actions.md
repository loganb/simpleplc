# measurement-card-actions

Status: implemented locally; no migration or hardware interface changes.

## Design

Add a dropdown to each measurement card with “Clear data…” and “Delete
measurement…”. Clear removes all retained raw samples and minute summaries
for that measurement, preserving its name and attachment. Attached measurements
resume collecting at the next evaluation. Delete removes the measurement and
its samples/summaries; it leaves its instance, source port, and instance traces
unchanged. Both operations ask for confirmation naming the measurement and
describing the consequence, consistent with existing instance deletion.

The menu trigger appears on card hover on devices with a fine pointer and
hover support, on keyboard focus within the card, and while the dropdown is
open. It is always visible on touch/coarse-pointer devices. Refactor the
current button card into a wrapper with sibling selection and menu controls,
avoiding nested buttons. Preserve the large card selection target, series
color, selected state, latest-value preview, and responsive grid. Menu clicks
must not change graph selection. Support keyboard navigation, Escape,
outside dismissal, appropriate accessible labels, and focus restoration.
Disable repeat mutations while pending and expose failures without removing
the card or concealing retained history.

## Schema and API

No migration or hardware interface changes.

- Enable existing REST `DELETE /measurements/:id` through MeasurementApi.
- Add a write-only `clear_data` boolean to the existing measurement PATCH
  contract: `PATCH /measurements/:id` with `{ measurement: { clear_data: true } }`.
  Cast using Rails boolean semantics; false is a no-op, and the field is never
  persisted or serialized. Keep existing attachment tuple validation intact.
- Run history deletion within the existing measurement update transaction and
  row lock. Sampling and measurement rollup creation already acquire that
  same lock. Explicitly lock deletion as well, so sampling/rollups cannot race
  dependent deletion. Review maintenance behavior if a measurement disappears
  after enumeration; handle that expected concurrent deletion without stopping
  maintenance for other measurements if needed.
- Clear removes both associated tables with delete_all, then updates
  `updated_at` so the existing after-update observer publishes a record
  notification. Delete returns the normal 204 response; Store evicts the
  measurement query/record, and chart selection drops its series. Delete does
  not publish a new record notification or history-resource invalidation.
- Invalidate measurement queries, instance attachment records, and raw,
  summary, and derived history resources following successful mutations.
  Confirm derived history invalidation works with the hook's retained display
  snapshot; explicitly reset/refresh the affected local history snapshot after
  successful clear so old points do not linger until the range timer expires.
- Frontend mutations use Store.patch / Store.destroy and existing transaction
  state conventions only. Extend measurement field typing for the write-only
  patch input as required without inventing a serialized field.

## Implementation sequence

1. Add request/service specs for clear, delete, attachment rollback, and
   maintenance racing a deleted record; add focused frontend regressions for
   menu behavior, mutations, and stale history responses.
2. Add the write-only `clear_data` patch input, lock and clear both history
   tables in the measurement transaction, publish a row update, and enable
   locked REST deletion.
3. Refactor each card into selection and sibling action controls. Use native
   buttons/menu semantics, confirm consequential mutations, support
   pointer/keyboard dismissal, and expose pending and error state.
4. Reset the retained chart snapshot after clear and start a query with a
   unique time window so older in-flight responses cannot repopulate erased
   points. Let Store deletion update the measurement query and selected series.
5. Run focused frontend tests/build and Ruby syntax checks. RSpec and browser
   verification are blocked by sandbox access to PostgreSQL and Playwright;
   see validation below.

## Test cases

- Clear attached and detached measurements with both raw samples and rollups;
  history/preview become empty and identity/attachment remain intact.
- Another measurement's samples and rollups are untouched.
- An attached cleared measurement records again on the next evaluation.
- False clear flag is a no-op; ordinary rename/attach/detach still work and
  incomplete attachments still fail without deleting data.
- Delete removes measurement and associated samples/rollups but preserves the
  source, instance, instance history, and other measurements.
- Clear responses invalidate measurement, instance, raw, summary, and derived
  history queries and return an empty preview. Store deletion evicts the
  measurement query; changed selected IDs refresh the remaining chart series.
- Menu operations do not toggle graph selection; cancellation sends no request.
- Clear/delete confirmations identify the measurement; pending controls reject
  duplicate submissions; failures remain visible and preserve the card/data.
- Successful clear immediately refreshes/reset displayed graph and preview,
  including stale in-flight history response protection and deselected cards.
- Successful delete removes card/series without changing other selections.
- Hover, keyboard focus, touch visibility, Escape/outside dismissal, and focus
  return work; existing range controls/card selection remain functional.

## Implementation notes

- `PATCH /measurements/:id` accepts `clear_data`; Rails boolean casting treats
  false as a no-op. The flag is removed before the model update and never
  serialized. A true flag deletes raw samples and minute rollups after locking
  the measurement, then updates `updated_at` to publish the observed-record
  notification.
- `DELETE /measurements/:id` is enabled and locks the measurement before
  dependent history deletion. `Logic::HistoryMaintenance` treats a row
  disappearing between enumeration and lock as an expected concurrent delete.
- The action trigger is revealed on fine-pointer hover/focus and remains
  visible on coarse pointers. Confirmations name the measurement and explain
  effects. Escape returns focus to the trigger; outside pointer and focus
  departure close the menu. Pending controls disable duplicate mutations;
  failures remain visible on the card.
- Clearing immediately removes the displayed chart snapshot. Its next query
  window advances by at least one millisecond, and a local generation guard
  prevents the old snapshot/request from being selected after reset.

## Validation

- `mise exec -- npm test -- src/tabs/measurements/MeasurementsTab.test.tsx src/tabs/measurements/useMeasurementHistory.test.tsx`: 22 tests passed.
- `mise exec -- npm run build`: passed.
- `mise exec -- npx tsc --noEmit` passed.
- `mise exec -- ruby -c` passed for `measurement_api.rb`,
  `history_maintenance.rb`, `measurements_spec.rb`, and
  `measurement_history_spec.rb`.
- Request RSpec could not run in the sandbox: PostgreSQL socket access is
  denied (`/tmp/.s.PGSQL.5432`, `Operation not permitted`). Browser verification
  could not run: Playwright launch is denied and no bundled Chromium is
  installed. No live measurement was changed.
