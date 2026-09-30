# Logic-Diagram Task

## Design

Add a new concept named **LogicDiagram**: a saved container that maps existing Measurements through ordered LogicBlocks and, later, Outputs. For this task, Outputs remain a placeholder concept in the UI and data model can defer concrete output records until the hardware/output API is clearer.

### Domain Model

- `LogicDiagram`
  - `name`
  - has many `logic_blocks`
  - uses existing global `Measurement` records as its source inputs rather than copying measurements into the diagram. Later, Measurements may become unique to a LogicDiagram.
- `LogicBlock`
  - belongs to `logic_diagram`
  - `name`
  - uses Rails STI via `type`, initially `HysteresisLogicBlock` and `LatchLogicBlock` (now also `TimerCounterLogicBlock`)
  - API/frontend still expose friendly `block_type` values, initially `hysteresis` and `latch` (now also `timer_counter`)
  - `stratum`, an integer column representing the frontend-computed topological column. Computation runs in ascending `stratum`.
  - `input_expressions`, JSON object keyed by input name. Expressions can reference Measurements and upstream LogicBlocks.
  - `config`, JSON object for block-specific settings.
- `Datum`
  - belongs polymorphically to a computed source (`source_type`, `source_id`). For this task that source is a `LogicBlock`; later it can also hold Measurement and Output history.
  - `recorded_at`
  - `value`, the block output value for that computation
  - `state`, JSON object containing retained block state after that computation
  - `input_values`, JSON array or object containing the computed result of each input expression for that computation. Prefer object keyed by input name unless Rails/SQLite constraints make an array materially simpler.

### Expression References

Expressions reference Measurements and LogicBlocks by name. To keep parsing unambiguous, Measurement names are globally unique expression-safe identifiers, and LogicBlock names are unique expression-safe identifiers within a LogicDiagram.

There is no alternate ID-token syntax; names are the expression reference syntax.

Expression syntax should be intentionally small for the first pass:

- Arithmetic: `+`, `-`, `*`, `/`, parentheses
- Comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- Boolean operators: `&&`, `||`, `!`
- Boolean truthiness: zero and `nil` are false; non-zero numeric values are true
- Optional functions can wait unless needed for outputs. `ANY(...)` from the example can initially be a frontend/output-expression convenience later, or supported now as a simple varargs boolean function if output expressions are included sooner.

### Block Semantics

#### Hysteresis

Inputs:

- `value`
- `low_limit`
- `high_limit`

Config:

- `mode`: `active_high` or `active_low`
- optional `initial_output`, default false

Behavior:

- Active high:
  - output becomes true when `value >= high_limit`
  - output becomes false when `value <= low_limit`
  - output is retained while `low_limit < value < high_limit`
- Active low:
  - inverse intent: output becomes true when `value <= low_limit`
  - output becomes false when `value >= high_limit`
  - output is retained between limits

#### Latch

Inputs:

- `set`
- `reset`

Config:

- `mode`: `latch_high` or `latch_low`
- `dominance`: default `reset`, matching the DHW heat lockout example
- optional `initial_output`, default false for `latch_high`, true for `latch_low`

Behavior:

- For `latch_high` with reset dominance:
  - if reset expression is true, output follows the current set expression
  - else if set expression is true, output becomes true and remains true
  - otherwise output retains prior state
- `latch_low` is the polarity-inverted variant. Implementation should normalize internally to a latched boolean and apply polarity at the output boundary, so tests stay readable.

#### Timer Counter

Added later; see `claude/timer-counter.md`.

Inputs:

- `input`

Config:

- `mode`: `active_high` (default) or `active_low`

Behavior:

- The output is a number: seconds since the input went active, measured
  between trace `recorded_at` times. It is 0 on the first active trace and 0
  while inactive.
- A null input outputs null but keeps the retained `active_since` state.

### Dependency Ordering

The frontend editor computes dependencies from expression references and saves each `LogicBlock#stratum`.

Backend should still validate obvious bad data:

- no block may reference a block in the same or later stratum
- no block may reference a block from another diagram
- referenced measurements and blocks must exist

The computation engine can then process blocks by `stratum ASC, id ASC`.

### Frontend UX

Add a Logic Diagrams area to the existing dashboard rather than replacing the measurement dashboard.

- Leftmost column: Measurements.
- Middle columns: LogicBlocks grouped by `stratum`.
- Rightmost column: placeholder Outputs column.
- LogicBlocks use a compact card metaphor:
  - front view: name, type, current output, key current input values
  - back/edit view: type-specific config and expression fields
- The editor should recompute strata whenever expressions change and block saves should persist the resulting stratum values.

The first implementation can use simple cards and forms consistent with the existing dashboard. Rich drag/drop layout can wait.

Each LogicBlock computation writes a new Datum row. Computation looks up the latest Datum for each LogicBlock to recover retained state and upstream output values. This keeps historical output values, internal state, and per-input expression results available for future graphing and debugging.

### Example Diagram

The boiler example maps naturally to:

- Measurements: `DHW_Temp`, `BoilerOutletTemp`, `OutdoorTemp`, floor calls, flow counts
- Blocks:
- `DHW_Call`: hysteresis active low, `value=DHW_Temp`, `low_limit=140`, `high_limit=160`
- `BOT_Ready`: hysteresis active high, `value=BoilerOutletTemp`, `low_limit=130`, `high_limit=140`
  - `Heat_Lockout`: reset-dominant latch high, `set=DHW_Call && !BOT_Ready`, `reset=!DHW_Call`
  - `Flow1_Lockout`, `Flow2_Lockout`: hysteresis active high, low/high `0.8/1`
- Outputs are deferred, but the eventual output expressions should likely be first-class `Output` records with an expression and hardware destination.

## Skeptical Notes / Alternatives

- The project already has a note about future computed Measurements. A simpler alternative would be to model every LogicBlock output as a Measurement. I do **not** think that is better here because hysteresis/latch state and output hardware mapping are control-logic concepts, not measurement sampling concepts.
- Storing `stratum` from the frontend is fine for UX and cheap compute, but the backend should still validate dependency order. Otherwise a stale or buggy editor could save a loop and make the controller compute nonsense.
- Expressions need a real parser, not `eval`. A small purpose-built parser/evaluator is likely enough. Pulling in a gem for expression parsing is an option, but the grammar is small and control logic wants very explicit safety.
- I am assuming LogicDiagram evaluation belongs in Ruby on the backend/controller side, even if the editor topological sort happens in TypeScript. If the eventual PLC runtime should be embedded/client-side only, that changes the design.

## Open Questions Before Implementation

Resolved:

- Show all global Measurements in the left column for now.
- Hysteresis comparisons are inclusive (`>= high`, `<= low`).
- Outputs are visual placeholders only for this task.
- Do not include a manual "evaluate diagram now" action in this first pass; smoke-testing/editing tooling will come later.
- LogicBlock output, state, and per-input computed expression values persist as historical Datum rows after evaluation.

Still open:

- None before implementation.

## Implementation Plan

Wait for confirmation before code changes.

### Red

1. Add RSpec to the project test setup because the project instruction asks for RSpec and the current app only has the generated Minitest skeleton.
2. Write model specs for `LogicDiagram` and `LogicBlock` validations:
   - required names/types
   - allowed block types
   - JSON input/config/state defaults
   - valid dependency references
   - rejects same-stratum, future-stratum, cross-diagram, and cyclic references
3. Write model specs for `Datum`:
   - required computed source, recorded_at, and value
   - JSON state/input_values defaults
   - latest-datum lookup for each LogicBlock
4. Write service specs for expression parsing/evaluation:
   - arithmetic
   - comparisons
   - boolean operators
   - measurement and logic block references
   - bad tokens/unknown references fail closed with a useful error
5. Write service specs for hysteresis and latch evaluation, especially retained state loaded from the latest Datum and persisted into the next Datum.
6. Write request/API specs for `logic_diagrams`, `logic_blocks`, and queryable Datum history using the existing RestfulApi wire format.
7. Add frontend Vitest tests for dependency extraction and stratum/topological sorting.

### Green

1. Create migrations/models:
   - `logic_diagrams`
   - `logic_blocks`
   - `data` polymorphic Datum table
2. Add `LogicDiagramApi`, `LogicBlockApi`, `DatumApi`, controllers, and routes.
3. Implement a small expression tokenizer/parser/evaluator under `app/services` or `app/models/logic/`.
4. Implement block evaluator classes for hysteresis and latch, creating a Datum row containing output value, updated state, and computed input expression values after evaluation.
5. Implement dependency validation using parsed expression references.
6. Add frontend store model definitions for `LogicDiagram`, `LogicBlock`, and `Datum`.
7. Add frontend helper functions for dependency extraction/topological strata assignment.
8. Add a first Logic Diagrams section/view with measurement column, logic block columns, and placeholder outputs column.
9. Add create/edit forms for diagrams and blocks using existing form/store patterns.

### Refactor

1. Extract shared form/card styling if the App component gets too large.
2. Move LogicDiagram UI into dedicated frontend components once behavior is passing.
3. Tighten serializer output so JSON fields are normalized and predictable.
4. Revisit whether expression parsing belongs in a reusable gem or local grammar after tests describe the full grammar.

## Verification

- `bundle exec rspec`
- `cd frontend && npm test`
- `cd frontend && npm run build`
- Manual smoke test in the running dev app: create a diagram, add hysteresis/latch blocks, confirm columns reflect dependencies, and verify frontend rejects/flags a dependency loop.

## Implementation Notes

- Added RSpec and backend specs for LogicDiagram, LogicBlock, Datum, expression parsing, block evaluation, and REST APIs.
- Added `logic_diagrams`, `logic_blocks`, and polymorphic `data` migrations/models.
- Converted LogicBlocks to STI so each block kind owns its validation/evaluation behavior. Friendly `block_type` names are an API concern; the model only uses Rails STI `type`.
- Added subclass accessors for latest computed input/output values and flattened those subclass-specific values in `LogicBlockApi`; frontend `LogicBlockFields` is now tagged on `block_type`.
- Added a safe expression parser/evaluator for arithmetic, comparison, boolean operations, and name references.
- Added hysteresis and latch evaluators that create Datum rows with output value, retained state, and computed input expression values.
- Added REST APIs/controllers/routes for logic diagrams, logic blocks, and queryable data history.
- Added frontend store models, dependency/stratum helpers with Vitest coverage, and a first Logic Diagrams dashboard section with Measurements, stratum columns, LogicBlock cards/forms, and visual-only Outputs placeholder.

Current verification:

- `mise exec -- bundle exec rspec` passes: 16 examples.
- `mise exec -- npm test` passes: 10 frontend tests.
- `mise exec -- npm run build` passes.
