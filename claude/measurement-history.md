# Measurement history graphs

Status: expanded plan approved by Logan on 2026-11-10; implemented and verified locally. Not deployed.
Task name agreed: `measurement-history`.

## Design

- Measurements has one shared graph above the measurement cards. Clicking a
  card toggles that measurement on the graph; use an accessible button with
  aria-pressed, a visible selected state, and a matching series color.
- A centered time selector controls the whole page: 1m, 10m, 1hr, 24hr, 7d,
  30d. Proposed defaults: 1hr and all measurements selected initially. Preserve
  selection and range when switching tabs in the current session.
- Numeric series use a mean line with min/max shading for aggregates and raw
  values for individual samples. Nulls and missing intervals are gaps. Break
  paths at attachment/type changes rather than connecting unrelated sources.
- Boolean series shade the graph background translucently when true. Raw
  samples give observed state intervals, not exact physical transition times;
  do not extend through nulls or known missing intervals. Summaries use opacity
  for true_fraction, explicitly labeled as fraction of samples true, not exact
  elapsed time on. Give overlapping boolean series distinguishable colors and
  legend/tooltip labels. Numeric scaling excludes boolean values.
- Cards retain name, attachment state, and latest-value context. Handle no
  measurements, no selection, empty history, loading, and query failures.
- Point budget is per selected measurement and follows available graph width.
  It requests presentation resolution over the entire window, never truncation.
  Quantize width changes to avoid excessive queries. Capture one since/until
  pair for all series; advance it on existing refresh cycles, not each render.

## Schema and hardware

No schema, retention, recording cadence, or hardware changes. Do not start a
poller or use production port 3001. No deployment is included.

## UX-facing API

Add a computed, read-only MeasurementHistoryPoint resource, with index/show,
MeasurementHistoryPointsController including RestfulApiController and a
MeasurementHistoryPointApi. Use a plain Ruby value object, not a new table.

Client: Store.m(MeasurementHistoryPoint).queryFor(null, {
measurement_ids: [...], since: ISO8601, until: ISO8601, target_points: 600 }).
Query arguments travel in JSON q on /measurement_history_points.json.

Response uses the existing flat envelope: query is an ordered array of point
IDs, measurement_history_points contains records, metadata describes the
requested range and chosen resolution. No custom response transport or Store
changes. Empty results must still include query: [].

Each record includes id, measurement_id, start/end (or recorded_at for raw),
kind (sample/bucket), value_type, source snapshot identity/names, and either
value or count/null_count/statistics. Numeric statistics: min/max/mean/last;
boolean: true_fraction/transitions/last. Represent missing intervals without
inventing zero values. Preserve source/type groups and late summary groups.

IDs must encode sufficient validated, versioned information to reproduce the
same logical point via by_ids without the original query: measurement,
interval or raw sample ID, source/type group, resolution, and representation.
Override canonicalize_ids for string IDs. Do not use measurement ID alone or
query-dependent ordinal IDs. Missing/expired points return not found; IDs do
not promise permanently retained contents. Show enforces the same access rules
as index. Decode only a strictly validated descriptor, never executable data.

Choose shared, deterministic time bucket boundaries from window / budget,
rounded upward to suitable durations. Short windows use raw points when their
counts fit; longer windows combine persisted summaries and necessary raw tail
into coarser buckets. Coarseness may increase where raw retention has expired;
each point exposes its actual interval, and metadata must describe mixed
resolution rather than claim a single resolution when it is not true.
Budget is approximate: source/type splits and preserved gap boundaries may
require extra records. Never discard the older part of the requested range.

Aggregate means/fractions by non-null sample counts, not averages of averages.
Do not count raw data already represented by summaries twice, including late
groups. Do not fabricate cross-bucket boolean transitions. Existing minute
summaries cannot supply exact sub-minute boundaries in expired raw history;
expose that resolution honestly rather than proportionally invent statistics.

Remove limit/default caps from measurement sample and rollup listings as
requested. Keep unrelated trace API behavior outside this change. Validate
time ranges, measurement IDs, and positive finite integral budgets; do not
silently clamp the request to a hidden point cap.

## Implementation plan (before code changes)

1. Add failing RSpec service/request examples defining history point shape,
   identity, complete-window coverage, budget choice, and show/index agreement.
   Review the rollup builder and maintenance implementation before selecting
   the raw/summary merge boundary and gap representation.
2. Implement a query/aggregation service and value object. Batch database reads
   across measurements; avoid a query per point and loading a full 30-day raw
   stream into Ruby. Prefer persisted summaries for long windows. Keep raw and
   aggregate representations distinct and source snapshots intact. Refactor
   only with focused specs green.
3. Add API/controller/routes and serialization via the existing controller.
   Add malformed-ID, missing-record, invalid-query and read-only request specs.
   Remove measurement listing caps with regression specs proving full ranges
   remain available. Check realistic 30-day query cost and payload size.
4. Add frontend failing tests and typed Store model. Implement a pure series
   transformation layer, explicit gap/source segmentation and numeric bounds.
   Use Store/useLoaders for every request and existing cache/refresh machinery.
5. Implement responsive shared graph using SVG and existing styling, centered
   range buttons, clickable cards, legend and timestamp/value details. Avoid
   new chart dependencies unless inspection shows a concrete need. Maintain
   stable colors, range/selection session state and quantized width budget.
   Ensure slow old queries do not replace the currently selected window.
6. Review delegated changes; run focused then full RSpec/frontend tests,
   TypeScript checking, frontend build and diff whitespace checks. Verify the
   built UI with the repository's Playwright workflow after reading
   frontend/screenshot.mjs. Use only a spare API/static server if needed; stop
   test servers afterward. Inspect desktop/mobile layout, mixed series,
   overlapping boolean shading and empty/error states.
7. Update this plan with results and claude/overview.md with final behavior.
   Correct the outdated response-envelope example in claude/restful-api.md.

## Delegation and review

After plan confirmation, delegate bounded backend and frontend tasks to Terra
agents as required by AGENTS.md, with separate file ownership. Parent reviews
aggregation/identity correctness, Store integration, accessibility and visual
results. No delegation or implementation before confirmation.

## Critical tests

- Every range covers its complete window, including data exceeding old caps.
- Budget changes resolution, not coverage; selected series align in time.
- Numeric weighted mean/min/max/last; false/zero/null retained correctly.
- Raw/summary overlap, grace-period tail, late groups, retention boundary,
  sparse history and all-null buckets do not duplicate or invent readings.
- Detached/reattached measurements and source/type switches remain separate.
- Boolean sample fractions and transition counts remain truthful after merges.
- Deterministic distinct IDs across resolutions and show/index equivalence;
  invalid IDs cannot request unchecked ranges or bypass measurement access.
- Card mouse/keyboard toggles, range changes, stable colors, resize budgets,
  tab persistence, refresh and out-of-order responses work through real Store.
- Empty, loading, failure and no-selection states; mobile graph and controls
  fit the viewport. Existing attachment UX and hardware behavior regressions.

## Detailed implementation specification — review draft, 2026-11-10

This section resolves implementation choices left open above and takes
precedence where the earlier outline is less specific. Logan confirmed this expanded plan on 2026-11-10. Agents must report contract changes to the
parent before changing the shared types or semantics.

### Frontend rendering: no graphing library

Use Preact components rendering native SVG. Do not add Chart.js, Recharts,
uPlot, D3, or another dependency. Required primitives are linear scales, line
paths, area paths and rectangles; implement pure geometry functions with unit
tests. Keep request/state code out of the renderer. SVG supports responsive
layout, CSS theme colors, clipped plot areas, pointer coordinates and DOM-based
inspection in the existing Playwright setup without a canvas adapter.

Planned files (names may change only with parent agreement):

- frontend/src/tabs/measurements/historyTypes.ts: shared wire/type definitions.
- historyGeometry.ts and historyGeometry.test.ts: scales, path segments,
  min/max bands, boolean interval rectangles, ticks and hover lookup.
- MeasurementHistoryGraph.tsx: SVG and accessible details/legend.
- useMeasurementHistory.ts: Store queries, stable window and width budget.
- MeasurementsTab.tsx: range controls, graph and toggle cards.
- uxTree.ts: MeasurementsUXTree with range and selection state.

Graph uses the full available width, 320px desktop height and 240px on narrow
screens, plus axis labels and legend. Use ResizeObserver; derive budget from
inner plot width as max(1, ceil(width / 100) * 100), approximately one point
per horizontal pixel. Debounce changes by 150ms. Skip requests until measured
and when selection is empty. No additional point cap. Query count is one for
the selected set, not one request per card. Sort/deduplicate selected IDs.

Time axis uses the exact shared requested window. Numeric Y domain covers all
selected numeric min/max values; pad by 5%, or max(abs(value)*0.05, 1) for a
constant series. No selected numeric data: omit numeric axis. Boolean series
never affect that domain. One numeric axis is appropriate for the existing
unitless measurement model; disparate numeric magnitudes will share that scale.
Do not invent units or silently normalize individual series.

Draw order: plot background/grid, boolean rectangles, numeric min/max bands,
numeric lines, hover cursor. Use clipPath for all data marks. Use actual CSS
pixel coordinates from observed dimensions, avoiding stretched text. Format
local time with Intl.DateTimeFormat: seconds for 1m/10m, hours/minutes for
1hr/24hr, date plus time for 7d/30d. Tooltip shows full local timestamp and
explicit raw/summary labeling. Set SVG role=img with title/description; do not
make thousands of points focusable. Provide a focusable graph container with
left/right arrow navigation through timestamps, and an HTML details region
shared by pointer and keyboard interactions. Touch selects nearest timestamp.

Stable series colors come from measurement ID mapped into a fixed theme-safe
palette; the same mapping drives cards and legend. Collisions are possible:
labels remain authoritative. Boolean raw true intervals use fill opacity 0.12;
false has no fill. Summary intervals use 0.12 * true_fraction, with an outline
and summary tooltip so zero fraction remains inspectable. Multiple selected
booleans overlay; legend entries identify them. Numeric aggregate line is mean;
raw line uses value. Min/max area opacity 0.12. Numeric paths break at null,
missing bucket, kind/type/source-group change; never connect a raw tail across
a summary boundary without explicit continuity evidence.

Initial selection includes all measurements; store deselected IDs rather than
selected IDs so newly created measurements are included automatically. Range
initially 1hr. Keep both in MeasurementsUXTree when tab unmounts. Card button
contains name, attachment, color, latest preview value/time and aria-pressed;
no nested interactive controls. Show latest null as unavailable, preserving
false and zero. Render graph controls above graph and cards below it.

Use existing root refreshToken as an explicit prop to this tab. Capture until
once on mount/range change/root refresh, derive since from it; never call
Date.now inside a loader to construct query arguments. Width or selection
changes reuse the same time window. Use useLoaders with all query inputs in
dependencies and Store as the tracked source. On a window change show the new
query's loading state; do not label the previous window as current. Parent
must inspect existing DataLoader2 dependency handling for stale result reuse
before accepting the implementation. No new polling timer in this feature.

### Concrete resource and query contract

Resource name MeasurementHistoryPoint, plural measurement_history_points,
string ID, index/show only. No special named query route. Query requires:
measurement_ids (array of positive integer IDs), since/until (ISO8601, since <
until), target_points (positive integer). Reject fractional, nonfinite, zero,
negative or malformed budgets with 422; do not clamp. Empty IDs => empty query.
Unknown measurement IDs return 404 rather than silently dropping a series.
Apply normal measurement read access to index and show. Wire JSON q is built
by Store, never by components. No IDs derived from user-provided names.

All points have:

    id: string
    measurement_id: number
    kind: 'sample' | 'bucket'
    start: ISO8601 with six fractional digits, UTC
    end: ISO8601 with six fractional digits, UTC
    source: snapshot without value (all identity/name/type fields retained)
    count: non-null sample count
    null_count: null sample count

Sample: start=end=recorded_at; additionally recorded_at and value. Bucket:
start<end; statistics contains min/max/mean for numbers or true_fraction for
booleans. Include last only when chronology is provable; otherwise last=null
and last_known=false. Use last_known=true to distinguish a known null last.
For samples last is unnecessary. Omit transitions on combined buckets unless
exact computation from raw readings is available; a sum of stored per-group
transitions is not an exact total. The current graph does not need transitions.
All-null bucket has count=0, null_count>0 and no numeric/boolean statistics.
Do not emit empty buckets as fake measurements.

Add bucket quality fields:

    coverage: 'raw' | 'summary' | 'mixed'
    gap_detail: 'samples' | 'minute'

Summary gaps within a minute and exact historical boolean transition times
are unavailable. Tooltip must state this; no promise of exact interval
occupancy. Buckets align across series when resolution matches.

Metadata:

    since, until, target_points
    series: [{ measurement_id, kind: 'sample' | 'bucket',
               bucket_seconds: number | null, returned_points: number }]

Metadata describes actual per-series resolution. A query-wide bucket_seconds
alone is insufficient when a sparse series stays raw. The renderer uses
point fields; it must not require metadata to interpret an individual record.

### ID specification, version 1

An ID is an opaque identifier to the client, not a secret or authorization
credential. Format:

    mhp1_<base64url(canonical UTF-8 JSON array), without padding>

Two allowed payload shapes:

    ["s", measurement_id, sample_id]
    ["b", measurement_id, start_us, end_us, group_digest]

Integers are positive decimal JSON integers except timestamps, which may be
negative. start_us/end_us are integer microseconds since Unix epoch. Restrict
them to the JavaScript safe-integer range; require start_us < end_us. Encoding
and decoding live exclusively in a Ruby MeasurementHistoryPointId module.
Use JSON.generate on exactly these arrays, Base64.urlsafe_encode64 with
padding:false. On decode, strict alphabet, prefix, shape, types and canonical
round-trip are mandatory. Reject a noncanonical equivalent encoding. No
Marshal, constantize, SQL text, filenames, query budgets, or mutable cache
keys inside IDs. Malformed show IDs return 404; malformed query args use 422.

For bucket IDs, group_digest is lowercase 64-character SHA-256 hex of
JSON.generate([logic_instance_id, logic_diagram_id, source_type, source_id,
value_type, logic_instance_name, logic_diagram_name, source_name]). Include
snapshot labels because existing maintenance groups by the full snapshot,
and a rename can produce multiple summary groups for the same physical port.
Late groups with the same descriptor merge; the late flag is provenance, not
identity. Source type is an allowlisted LogicInput or LogicOutput, and value
type is the existing number/boolean enum. Never decode the digest as data.

For show, first validate descriptor and authorize measurement. Sample lookup
uses both IDs. Bucket lookup recomputes only the encoded interval, builds its
source groups, hashes each descriptor and returns the matching group. Index
and show use the identical bucket reducer and storage-tier selection rule.
Resolution is represented by end_us-start_us; interval boundaries fully
specify a bucket, so target_points and full query window are not part of ID.
Changing budget without changing a bucket's interval/source produces the same
logical record, as intended. Contents may change with new/backdated samples,
maintenance or expiry; this is a mutable computed resource, not a snapshot.
The representation algorithm version is the mhp1 prefix; bump it for changes
that alter point meaning. No database table or persisted query-token registry.

Bucket show supports arbitrary validated intervals, not just intervals emitted
by the current UI. This is equivalent to the existing time-range listing;
parameterized queries and tier selection must keep it safe and bounded by
retained data. Do not introduce undocumented maximum duration/point caps.

### Resolution and data retrieval algorithm

Use integer microseconds throughout calculations. Count raw samples per
measurement in [since,until) with a grouped query. A measurement is eligible
for raw mode only when its requested window lies wholly within the nominal
48-hour raw retention and raw count <= target_points. Empty raw history in
that window is a valid empty series. All other measurements use buckets.
If summary-only rows exist without raw in a nominally retained minute, choose
bucket mode for that measurement instead of claiming raw coverage.

For bucket mode choose the smallest duration >= window_seconds/target_points
from 1,2,5,10,15,30 seconds; 1,2,5,10,15,30 minutes; 1,2,3,6,12 hours;
1,2,7,14,30 days. Beyond the list, round upward in whole 30-day multiples.
If the window reaches beyond raw retention or contains summary-only minutes,
minimum duration is 60 seconds. Use one chosen duration for all bucket-mode
measurements in the query (maximum of their requirements). Raw series remain
samples. Budget is approximate: edge buckets and multiple source groups can
increase record count; document this, never truncate records to hit the budget.

Anchor regular buckets to UTC epoch multiples of duration; intersect first/
last with exact requested since/until. Those clipped endpoints are encoded in
IDs, preserving query-window semantics. For historical boundaries cutting a
minute where raw has expired, include that minute's summary at its full
minute interval and expose actual start/end, potentially outside requested
window by <60 seconds. Never prorate summary values or pretend they represent
only the clipped fraction. Merge only whole summaries inside a bucket;
partial edge-minute summaries are separate 60-second points. Graph clips at
requested window and tooltip gives actual support interval. Deduplicate these
edge points and report their returned count in metadata.

Read index within a REPEATABLE READ, read-only transaction so rollup updates,
rolled_up flags and pruning cannot disagree mid-request. For resolution >=60s,
use persisted rollup groups plus raw samples where rolled_up=false. For
resolution <60s, use raw only and verify the window is within raw availability.
Do not union all raw rows with summaries: raw rolled_up=true points are already
represented. Partial edge minutes with retained raw use all raw samples in the
requested fraction instead of their summary; exclude that minute's rollup
entirely from the same interval. If represented samples have partially expired,
use full-minute summary plus only unrolled raw, never a partial reconstruction
from remaining represented raw. Inspect count totals to establish completeness.

Fetch rollups in batches with selected columns. Aggregate unrolled raw in SQL
where practicable; if using Ruby, stream ordered rows in bounded batches and
keep only per-output-bucket accumulators. Never load full 30-day raw history.
SQL is parameterized, no interpolated query IDs/timestamps. No query per output
point. Show requests batch repeated descriptors in by_ids when possible.

Reducer keys by interval + full source descriptor. Counts and null_counts
sum; numeric min=min(min), max=max(max), mean=sum(mean*count)/sum(count).
Boolean true_fraction=sum(true_fraction*count)/sum(count). Use full precision
until serialization. Missing stats on all-null groups contribute zero non-null
count, not a zero reading. Numeric last/boolean last may be carried only from
fully ordered raw inputs; when merging persisted summary groups lacking exact
sample chronology, omit certainty as specified above. Most recent stored
minute does not prove ordering among its late groups. Do not change rollup
storage or maintenance to manufacture missing historical information.

An omitted bucket is an observable gap. A bucket containing null_count>0 is
marked incomplete for plotting: tooltip reports it, and numeric paths do not
bridge to its neighbors as if continuity were known. For raw boolean shading,
shade from a true observation to the next observation of the same source;
null or a source change terminates it. Do not extend the final observation
through the query end without a later observation. Large raw inter-observation
intervals cannot reliably distinguish slow sampling from missing evaluations;
show the observed interval and label the sample interpretation, avoiding an
invented timing threshold. Parent reviews this limitation in UI before signoff.

### Delegated work packets and acceptance gates

Parent first freezes TypeScript/Ruby wire examples and shared test fixtures
before starting concurrent agents. Spawn Terra with fork_turns=none, explicit
repository path, relevant approved spec, ownership and no-hardware constraints.
Agents use red-green-refactor and must return changed files, exact checks run,
known limits and any contract deviations. No agent deploys, starts pollers,
installs dependencies, or edits another packet's owned files.

1. Backend Terra owns new app/models/measurement_history_point.rb,
   app/services/measurement_history/*, API/controller, routes and new RSpec
   service/request files. Implements codec first, then reducer, tier retrieval,
   flat envelope and show. Also removes caps only from MeasurementSampleApi and
   MeasurementRollupApi, with request regressions. Deliver codec fixtures for
   parent to review before frontend integration. Do not edit maintenance/schema.
2. Frontend geometry Terra owns historyTypes.ts, historyGeometry.ts/test,
   MeasurementHistoryGraph.tsx and graph tests. Works from agreed fixtures,
   with no Store requests or root state changes. Delivers numeric/boolean/mixed
   screenshots or deterministic render fixtures, keyboard details behavior and
   tests for null/source/type boundaries and clipping.
3. After shared types are reviewed, frontend integration Terra owns
   useMeasurementHistory.ts/tests, MeasurementsTab.tsx/tests, uxTree.ts,
   store.ts model registration, and App.tsx refresh wiring. Uses graph component
   contract, real Store transport mocks, and no Axios imports. Can run concurrently
   with geometry once component props are frozen by parent.
4. Parent owns plan/overview/restful-api documentation, cross-layer review,
   end-to-end fixtures, browser verification and final report. Review PostgreSQL
   query plans for 30 days of minute summaries and a realistic selected set;
   report measured rows/time/payload, no invented performance guarantee. Audit
   codec show/index agreement, transaction scope, memory use, summary/raw
   deduplication, DataLoader2 stale-response behavior and all boolean limitations.

Backend gate fixtures include: zero/false/null samples; 120 samples at mean 10
plus 30 at mean 20 => mean 12; boolean counts 3 at 1.0 plus 1 at 0.0 => 0.75;
minute with original+late groups; same-source rename; adjacent type change;
request straddling raw expiry; partial historical minute; all-null and omitted
minute. Test exact index/show record equality under fixed DB state. Include
codec golden vectors generated independently from the specified JSON arrays,
round-trip microseconds, invalid base64/JSON, wrong prefix/version, wrong types,
unsafe integers and a digest that matches no group.

Frontend gate fixtures must come from the same JSON shapes. Verify request URL
q decoding, sorted selected IDs, full range preservation, point budget resize,
empty selection makes no query, selection survives tab switch, no new clock
value on Store notification, loading after range change, stale response cannot
relabel old data, correct true_fraction tooltip and known-null vs unknown last.

This draft was approved by Logan on 2026-11-10 before implementation began.

## Chart library evaluation — 2026-11-10

This replaces the earlier no-library decision and handwritten SVG geometry
packet. Recommendation: Apache ECharts with selective imports and SVGRenderer,
used directly through a small Preact lifecycle component, without a React
wrapper. This is a documentation-based selection, not a completed prototype
or measured bundle comparison. No packages have been installed for evaluation.

Compared options:

- ECharts: framework-independent DOM initialization; time/value axes, axis
  pointer, tooltips, null gaps, SVG/canvas renderers and custom interval series.
  Best fit for differently sampled series and explicit [start,end] bucket
  support. Selective imports limit unused features, but actual build cost must
  be measured. Custom rendering remains necessary for interval min/max bands;
  library handles axes, coordinates, scene lifecycle and interactions.
- uPlot: time-series-focused, canvas, documented approximately 50 KB minified
  core, built-in high/low bands, gaps and cursor support. Standard aligned-data
  mode means joining differently sampled series and maintaining the distinction
  between absent timestamps and real nulls. Boolean rectangles need a hook or
  overlay, and interval-specific hover/keyboard details stay application work.
  Strong alternative if ECharts build cost proves disproportionate.
- Chart.js: plain JS integration, selective imports, fill-between-dataset bands,
  tooltips and resizing. Boolean full-height intervals need a plugin; ordinary
  time scale requires a date adapter/library. Canvas accessibility is explicitly
  application-owned. Viable, with more feature-specific glue for this view.
- Recharts: React/D3-based SVG component library. Its React requirements add a
  compatibility verification burden to this Preact app; do not assume compat
  aliases prove support. No clear requirement advantage over framework-neutral
  ECharts here. Not selected.
- Direct SVG/D3 primitives: maximum control, but leaves axis layout, interactions
  and resizing to us; duplicates library responsibilities. Not selected.

Official references consulted:

- https://echarts.apache.org/handbook/en/basics/import/
- https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/custom.md
- https://echarts.apache.org/handbook/en/best-practices/aria/
- https://github.com/apache/echarts/blob/master/test/markArea.html
- https://github.com/leeoniya/uPlot
- https://raw.githubusercontent.com/leeoniya/uPlot/master/dist/uPlot.d.ts
- https://www.chartjs.org/docs/latest/charts/area.html
- https://www.chartjs.org/docs/latest/developers/plugins.html
- https://www.chartjs.org/docs/latest/axes/cartesian/time.html
- https://www.chartjs.org/docs/latest/general/accessibility.html
- https://github.com/recharts/recharts

### ECharts implementation direction for Terra

Use echarts/core, LineChart and CustomChart from echarts/charts, GridComponent,
TooltipComponent, MarkAreaComponent and AriaComponent from echarts/components,
and SVGRenderer from echarts/renderers. Do not import the full echarts package,
React wrappers, data transforms, dataZoom, animation or client decimation. Add
only the npm echarts dependency and its normal lockfile dependencies after
plan confirmation. Pin the resolved release in the lockfile.

Replace historyGeometry.ts with historySeries.ts: pure transforms produce
raw numeric line segments, numeric bucket intervals and boolean intervals.
ECharts owns scales/ticks/coordinates; retain unit tests for semantics,
segmentation, interval boundaries and tooltip values, not library internals.

Numeric raw observations use LineChart, smooth=false, connectNulls=false,
showSymbol=false except isolated points. Explicitly separate source/type
segments and gaps. Numeric summaries use a CustomChart renderItem creating a
clipped min/max polygon or interval rectangle and mean segment over each
bucket's actual [start,end]. Do not interpolate buckets across gaps. Use the
library coordinate conversion and clipping helpers, not handwritten scale
math. Draw adjacent compatible mean segments continuously only where source
and null/gap rules allow it. Negative ranges must work without stacked-area
baseline tricks.

Boolean series use markArea intervals with per-item fill opacity and xAxis
start/end only, making them full plot height independent of numeric Y domain.
If prototype shows markArea cannot provide reliable interval inspection or
layering, use CustomChart rectangles with coordSys.y/height. This is a bounded
implementation fallback within ECharts, not license to switch libraries.
Keep boolean data out of numeric domain inference. Set explicit numeric Y
bounds from numeric records; boolean-only chart uses a hidden [0,1] axis.

Disable animation globally. Use time axis with explicit min/max from the
window, and library tick placement with local-time label formatting. Use
stable measurement/segment series IDs; on selection/range change replace the
series collection so removed segments cannot persist through option merging.
Card selection remains Preact state, not ECharts legend state. Tooltip must
handle independent sample timestamps and interval containment; do not assume
all series share dataIndex. Use safe HTML DOM content or escaped labels.

Create once in an effect attached to a DOM ref, update with setOption, resize
via existing ResizeObserver and dispose on unmount. Import library CSS only
if needed; SVG styles and theme colors come from app configuration. API point
budget still follows observed inner plot width and has no client truncation.
No library can recover information lost in rollups; all earlier truthfulness
rules still apply.

ARIA descriptions do not provide complete keyboard data exploration. Keep
HTML legend/details and the planned keyboard timestamp navigation; drive the
library cursor/tooltip through supported APIs where practical. Do not claim
SVGRenderer makes the chart automatically accessible.

### Prototype and review gate after implementation approval

Before full UI integration, graph Terra builds a focused example using agreed
fixtures: irregular timestamps, negative numeric values, source/null gaps,
variable-width min/max intervals and overlapping boolean shading; include a
boolean-only chart. Verify pointer, touch, resize, keyboard details, series
removal and no lifecycle leaks in Playwright. Parent inspects the resulting
SVG and screenshots. Measure production esbuild raw/gzip JS before and after
selective imports and report the actual delta; do not compare unrelated npm
package sizes or cite vendor benchmarks as app measurements. If unacceptable
performance or adapter complexity appears, report evidence before changing
the library. Backend/API plan and identity contract are unaffected.


## Implementation and verification — 2026-11-10

Completed by three Terra agents (backend, ECharts rendering, frontend Store/UX
integration), reviewed and integrated by the parent. Approved plan was committed
first as 4bb7278, establishing a clean tree before code implementation.

Final implementation uses ECharts 6.1.0 selective imports and SVGRenderer. Boolean
background intervals use custom rectangles rather than markArea; no unused
MarkAreaComponent ships. Numeric bucket means use stepped lines across adjacent
compatible intervals, with separate min/max rectangles and explicit null/source
gaps. Outlines were removed from boolean buckets after real-browser inspection
showed that dense outlines obscured long-range numeric plots. Fractions remain
inspectable through timestamp details even when zero. Graph details label raw,
minute and combined summaries in ordinary language, with shared uncertainty
notes. Arrow-key navigation works from timestamps and arbitrary hovered times.

The point ID codec uses the documented canonical JSON/base64url layout. Source
groups use SHA-256 over the ordered snapshot fields. Partial expired boundary
minutes expose their full support; adjacent coarser buckets trim their support
to avoid overlap and double shading. Index and show share the reducer and were
compared through HTTP on the review dataset as well as in RSpec. Summary-derived
last values are conservatively unknown; exact transitions are not reconstructed.
Sample/rollup listings have no default/max cap; caller-specified positive limits
remain supported and invalid values return 422. Trace listing caps are unchanged.

Frontend queries use only Store and capture a stable shared window. A local
query-key guard prevents DataLoader2's retained result from presenting an older
window after input changes. Deselected IDs and range live in the UX tree; new
measurements therefore start selected and tab switches preserve user choices.
No new frontend polling cadence, recording, maintenance or hardware behavior.

Verification:

- Final focused RSpec: 20 examples, 0 failures (new API/codec and existing
  measurement request coverage). Full suite before the last edge regression:
  375 examples, only the same two baseline HostPorts failures at
  spec/requests/host_ports_spec.rb:76 and :87 due to unavailable /dev/ttyUSB0
  on this Mac. The final edge regression was then added and passed in the
  focused suite; no claim of a completely green full suite.
- Full frontend suite: 95 tests in 18 files pass. TypeScript noEmit check and
  production build pass. Ruby lint: 10 changed/new API/model/controller/service/
  spec files pass; git diff --check passes.
- Browser: built frontend served on temporary port 5199 against API-only Rails
  on port 3002 and disposable plc_history_review_20261110 database. Four series,
  2,343 raw samples and 172,760 minute rollups covered 30 days. Real ECharts SVG
  verified at 1440px desktop and 390px mobile: numeric/boolean/mixed selection,
  boolean-only plot, 30-day range, pointer/keyboard details, all-off state,
  selection/range persistence across tabs, width-driven 1400/300 point budgets,
  and no horizontal overflow or page errors. Inspected rendered screenshots.
- Playwright's bundled Chromium download repeatedly timed out; used Playwright
  with installed Chrome channel (157.0.8103.39), not the prohibited Chromium CLI.
- Production JS isolated from the running development watcher: 754,449 bytes raw,
  251,190 bytes gzip. Baseline: 205,633 raw / 61,384 gzip. Delta: 548,816 raw /
  189,806 gzip. Bundle size is a material ECharts tradeoff, now measured.
- Four-series 30-day HTTP query with target_points=600 returned 1,448 points
  (362 per series, 2-hour nominal buckets plus partial edges) and about 1.16 MB
  of JSON. Initial request 4.73s; warm request 4.58s on this Mac in Rails
  development mode. Batching EXPLAIN used the primary-key index, retrieving
  1,000 selected rollups in 0.656ms with 72 shared-buffer hits. Ruby JSON/group
  reduction and full history scanning remain costs even though returned point
  count is bounded by requested presentation resolution. Measure on the Pi
  before production deployment; no production performance guarantee is made.

Known implementation limits: bulk by_ids batches sample lookups but reconstructs
separate bucket descriptors independently; ordinary show requests use one ID.
Summary timestamps cannot supply exact historical on/off intervals or missing
positions within a minute. No schema migration is needed. No deployment or
poller was started. Temporary services and review database are removed after QA.
