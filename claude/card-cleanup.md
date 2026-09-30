# card-cleanup

Declutter the Logic tab cards (`frontend/src/tabs/logic/LogicTab.tsx`) and
align the columns.

## Design

### Measurement card (`MeasurementCard`)
Remove the muted footer lines:
- `Source: <device> · <input label>`
- `Path: <source_path>`
- `<m.name>` in mono (it duplicates the title)

Keep the value, the Acquisition/Simulation toggle, and the transient
`Saving...` / error lines. The source is still visible in the edit form.

### Logic block card (`LogicBlockCard`), expression type
Remove the whole muted footer: the mono name (duplicates the title), the
computed `value: <n>` line, and the `value: <expr>` input-expression line.
The expression shows as a hover tooltip on the Output row instead.

The same footer shows on hysteresis/latch/timer cards
(the mono name, computed inputs, input expressions, and a raw `state {json}`
dump). Options:
- (a) expression cards only, as asked
- (b) all types: drop the footer, and each card's Output-row tooltip lists
  every input expression (`low_limit = …`, one per line)

Decided (b): same clutter, same fix, and the computed inputs and raw state
JSON are debug output.

Tooltip: native `title` attribute on the Output row. It's zero code, but it
has the browser's ~1s delay and plain styling. The alternative is a styled
CSS hover popover (Tailwind `group-hover`), which shows at once and in mono.
Decided: `title`.

### Output card (`OutputBlockCard`)
Added after the first pass. Remove:
- the mono `input_expression` line. It becomes the `title` on the Desired
  box, which is the value the expression computes.
- `Pending poller write`. `write_pending?` is just `!effective_output.nil?`.
  It is true whenever the output is live, and no write ever clears it
  (the poller rewrites every enabled output each cycle), so it duplicates
  Effective.
- `Skipped: <reason>`. Its reasons restate Desired = `—` or the two
  Output toggles.

Desired/Effective become one **Output** box showing only what the card
computes (styled like the block cards' Output row, expression as its
`title`). It shows `desired_output` and is styled by whether this card is
driving it:
- driving true (Output Enable on, desired true): green (`bg-ok-bg`, `text-ok`)
- driving false (Output Enable on, desired false): normal text
- not driving (Output Enable off, or desired unknown): greyed out, still
  showing the computed value (or `—`)

The diagram-level Outputs toggle deliberately doesn't factor in. The card
reflects only its own state. `effective_output` is no longer read by the
frontend.

The API still returns `write_pending` and `latest_state.write_skipped_reason`,
and the frontend no longer reads them. A real "pending" would need the poller
to record the last written value, which is a separate task.

### Column alignment
Measurements and Outputs wrap `ColumnHeader` (which has its own `mb-2`) in a
`mb-2 flex` row with a `+ New` button, so their header area is taller than
the strata's and their cards start lower. Fix: `ColumnHeader` takes an
optional `action` and always renders a fixed-height row (`h-7 mb-2 flex
items-center justify-between`), and all columns use it.

Also: logic block cards use `p-4` while measurement/output cards use `p-3`,
so card tops line up but their titles sit 4px lower. Decided: unify on `p-3`.

## Plan

This is frontend-only, so the tests are vitest (`@testing-library/preact`,
like `LogicBlockForm.test.tsx`), not rspec.

1. Red: add `LogicTab` card tests. Export `MeasurementCard`,
   `LogicBlockCard`, and `ColumnHeader` for testing.
   - A measurement card in acquisition mode with a device and source_path
     renders no `Source:` / `Path:` text.
   - An expression block card has no `value:` text, and its Output row's
     `title` is the expression.
   - A hysteresis card's Output-row `title` lists every input expression,
     one per line, and there's no `state {…}` dump.
   - `ColumnHeader` with and without an action renders the same row class
     (a cheap guard on the alignment. jsdom can't measure layout).
2. Green: make the changes above.
3. Run `npm test` and `npx tsc --noEmit`, then build and screenshot the
   Logic tab against a :3002 Rails server to check alignment by eye.

## Result

Done as planned. Checked in Playwright against stubbed API data (the dev DB
has no diagrams): all column headers at y=181, first cards at y=211, and the
Output-row `title`s are the bare expression (expression blocks) or one
`name = expr` per line (other types).
Output card pass: the expression is the `title` on Desired, and the pending,
skipped, and expression lines are gone. The footer renders only while saving
or on error, so the card has no trailing gap.
One-box pass: Desired/Effective replaced by a single Output box (green when
driving true, plain when driving false, greyed at 50% when Output Enable is
off or the value is unknown). Verified all four states in a screenshot.
