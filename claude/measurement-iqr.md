# measurement iqr scaling

status: approved and implemented locally; not deployed.

## goal and current behavior

keep isolated extreme readings from compressing measurement history, without
modifying recorded values. the motivating example is a temporary reading of
200,000 among values near 1 after attaching a measurement to the wrong source.

`frontend/src/tabs/measurements/historySeries.ts` builds window-clipped numeric
lines, summary mean lines and min/max bands. `numericDomain` currently unions
all visible raw geometry and bucket extrema and adds 5% padding. the shared
echarts graph consumes that domain. raw requests also return boundary context.
history responses can contain raw samples or buckets with min/max/mean/count;
they do not contain original distributions or quartiles for buckets.

## proposed design

### range estimation

1. calculate fences independently for each selected measurement, then union
   its retained bounds with the other measurements. pooling different scales
   could incorrectly classify an entire measurement as outlying.
2. use finite numeric observations from the visible window as the quartile
   population: one value per actual raw sample, one mean per intersecting
   numeric bucket. exclude booleans, nulls, out-of-window context samples and
   synthetic boundary interpolations. do not duplicate means for both ends of
   a bucket line or weight a bucket mean by its underlying count.
3. require at least 8 population values per measurement; otherwise use that
   measurement's existing full visible bounds. this is a conservative small
   sample policy, not a statistical guarantee.
4. sort a copy; compute q1 and q3 using linear interpolation at index
   `(n - 1) * p`, for p = 0.25 and 0.75. iqr = q3 - q1. fences are
   `[q1 - 3 * iqr, q3 + 3 * iqr]`, inclusive. use 3 rather than 1.5 to target
   extreme excursions. guard nonfinite arithmetic by falling back to full bounds.
5. fit each measurement's bounds to finite visible raw geometry values and
   bucket min/max/mean values inside its fences. do not delete geometry or
   substitute fabricated observations. if nothing remains, use full bounds.
6. when iqr is zero, use the collapsed fence `[q1, q3]`; this deliberately
   retains the dominant constant level and excludes departures. do not fall
   back to the spike-inflated full range just because iqr is zero.
7. union the resulting per-measurement bounds, then apply the existing 5%
   padding. retain the existing constant-range padding of
   `max(abs(value) * 0.05, 1)`. boolean-only charts retain their hidden axis.
8. recompute on successful data/window/selection changes. keep the current
   behavior of retaining the previous successful snapshot during refresh.

bucket mode is explicitly approximate: quartiles describe bucket means, not
original samples. min/max alone cannot recover a clean distribution inside
a contaminated bucket. fitting only retained extrema/means can omit legitimate
within-bucket variation, and aggregation or plot-width changes can change the
result. exact raw quartiles would require a separate backend/storage design.

the zero-iqr rule can also clip legitimate rare numeric states, and any iqr
method can clip a real short-lived operating state. the interface must expose
this behavior and provide full-range inspection.

### ux and rendering

- default to robust scaling. provide an always-available accessible checkbox,
  `show full range`, restoring the existing domain calculation when checked.
  keep its state for the graph component's lifetime, including refreshes,
  selection changes and time-range changes; resetting on tab unmount is acceptable.
- when numeric geometry exceeds the final displayed domain, show a compact
  `some values are outside the displayed range` notice. report actual clipping,
  not merely classification beyond a fence; another series or padding may make
  those values visible. do not claim an underlying sample count from a bucket.
- add series-colored upward/downward boundary indicators at off-scale sample
  timestamps. for summary bands, use the visible bucket midpoint and label
  the indicator as a summary interval, never an exact spike timestamp. one
  indicator per affected direction per bucket; batch markers per measurement.
- clip original lines and bands at the plot boundary. do not clamp original
  data to the axis edge or connect across a removed spike as if it never happened.
- keep cursor readouts and keyboard access to original values, including the
  full 200,000 reading and original summary statistics. identify off-scale
  values in the readout. retain cursor position across scale switches/refreshes;
  avoid highlighting symbols outside the plot area.
- retain boolean shading, source/null gaps, current units and series selection.

## implementation sequence after approval

1. delegate implementation to a lower-tier agent as required by project
   instructions; parent reviews the algorithm, rendering and tests.
2. red: extend `historySeries.test.ts` with the cases below. keep existing
   full-range behavior explicitly testable. add a pure range-analysis helper
   returning full and robust domains plus clipping metadata; compute quartile
   populations from original records with explicit window inputs.
3. green: implement the helper in `historySeries.ts` without changing the
   existing history transformation or server query. avoid mutating store records.
4. red: extend `MeasurementHistoryGraph.test.tsx` for mode switching, notices,
   original readouts, indicators, chart clipping and cursor preservation.
5. green: wire memoized analysis, local mode state and markers into
   `MeasurementHistoryGraph.tsx`; extend `historyTypes.ts` only if necessary.
6. refactor after focused tests pass. run the full frontend suite, typescript
   checking, production build and diff whitespace checks. no ruby behavior
   changes are planned, so rspec is unnecessary unless backend scope changes;
   any backend change requires red-green rspec coverage first.
7. inspect the built ui with playwright and mocked standard store responses
   for raw and summary cases at desktop/mobile widths. verify clipped segments,
   true values, both modes, marker alignment and stationary cursor behavior.
   read `frontend/screenshot.mjs` first. do not start a poller or use port 3001.
8. update this note and `claude/overview.md` with implementation and validation
   results. no deployment, commit or push is included in this task.

## test cases

- varying readings near 1 plus isolated positive/negative extreme spikes.
- constant 1 plus 200,000; all-constant and all-zero readings; negative levels.
- deterministic interpolated quartiles, inclusive fences and input immutability.
- empty/null/boolean/nonfinite input; fewer than 8 usable values; fallback when
  no bounded geometry remains; arithmetic overflow; singleton axis padding.
- multiple measurements on different scales; deselection recalculates the
  shared domain without excluding a whole legitimate high-valued series.
- numeric steps with substantial time at each level remain represented; rare
  states may clip but remain inspectable through markers and full-range mode.
- bucket extremes with normal means; contaminated means among normal buckets;
  means counted once, not once per underlying sample or line endpoint.
- mixed raw/summary history, partial buckets and source/null boundaries.
- boundary context cannot enter quartiles; interpolated visible boundary
  geometry is evaluated for bounds and clipping; context-only sparse lines
  retain the current full-range fallback.
- clipping notices reflect final shared padded bounds; summary indicators do
  not imply exact timestamps or counts; full-range mode clears clipping notices.
- toggle preserves true series data, accessible values, cursor and refresh
  behavior; off-scale values remain reachable with keyboard and pointer time.

## schema, api and hardware

- schema: none.
- ux-facing api: none. continue using the existing store history queries.
- hardware interfacing, recording, retention and poller: none.


## implementation and verification

implemented after user approval, using an isolated source snapshot of commit
`9f1cd98246565970488ba6e1971253485e101fe8`. the original working tree contained
an existing `AGENTS.md` edit and this untracked plan. git metadata writes are
blocked in this environment, so creating a worktree failed; `git archive HEAD`
provided a clean source baseline without changing either original file. only
reviewed feature files were copied back. the existing instructions edit remains
untouched. implementation was delegated to terra and reviewed by the parent;
tests were added after initial implementation, so the planned red-first
sequence was not fully followed.

the pure `analyzeHistoryRange` helper calculates full and robust domains;
`historyClipping` provides clipping metadata against the final shared padded
axis. numeric raw observations use the half-open query window for quartiles,
excluding the right-boundary successor. visible interpolated geometry still
contributes to displayed bounds and clipping. padding guards nonfinite results.

robust scaling is the default. the local full-range checkbox survives live
updates, range changes and series changes. original chart geometry and cursor
statistics are preserved; off-scale values are labeled and their highlighted
symbols are suppressed. filled boundary triangles identify raw readings;
hollow triangles identify summary intervals at their visible midpoints, with
an explanatory caption and chart description. custom marker series explicitly
encode time only, so echarts does not interpret direction flags as y values.
boolean shading and source/null gaps are unchanged. bucket estimation retains
the documented approximation and zero-iqr rare-state limitation.

verification in the clean source snapshot:

- full frontend suite: 135 tests across 19 files pass.
- typescript no-emit check and production build pass.
- range regressions cover isolated positive/negative spikes, zero iqr, sparse
  data, per-measurement scales, bucket extrema, ordinary steps, inclusive fences,
  boundary context, invalid values and finite overflow handling.
- component regressions cover unchanged original data/readouts, off-scale
  keyboard access, mode/cursor persistence, direction and midpoint marker data,
  and notices based on the final shared range.
- tests using the actual echarts svg renderer verify raw and summary modes at
  1000x320 and 342x240 chart dimensions: finite svg coordinates, both polygon
  markers at the upper/lower boundaries, filled versus hollow styles, and
  full-range ticks reaching 200,000 after toggling.
- playwright with installed chrome was attempted against a temporary static
  server and mocked standard store responses. chrome aborted on launch in the
  sandbox before loading a page. browser layout, pointer interaction and mobile
  page overflow therefore remain unverified; svg rendering tests supplement
  but do not replace browser qa. the temporary server was stopped.
- no ruby/backend code changed; rspec was not rerun. no poller, hardware writes,
  schema changes, api changes, production testing or deployment.
