# Timer Counter

Two phases. Phase 1 gives the expression language real null handling. Phase 2
adds `TimerCounterLogicBlock`, a block that outputs a number instead of a
boolean.

## Phase 1 — Null handling in expressions

### Design

Today `===`/`!==` are the only operators that turn null into something
non-null. Every other operator, including `&&` and `||`, returns null when
either operand is null, and there are no functions. Phase 1 changes this in
three ways.

**`a ?? b` (null-coalescing operator).** Returns `a` unless `a` is null, in
which case it returns `b`. It has the lowest precedence, below `||`, as in
JS/C#: `x > 5 ?? false` parses as `(x > 5) ?? false`. It is lazy: `b` is
evaluated only when `a` is null. The value is returned without coercion, so
`t ?? 0` is a number and `flag ?? false` is a boolean.

**`coalesce(a, b, ...)` (SQL-style function).** Returns the first argument
that is not null, or null if all of them are. It takes one or more arguments
and evaluates them lazily, left to right. This is the language's first
function-call syntax:

- The tokenizer gains a `,` operator token.
- `parse_primary` treats an identifier immediately followed by `(` as a call.
- Function names are case-insensitive (`COALESCE` also works), to match the
  `true`/`null` literals.
- Function names are **not** added to `references[:identifiers]`, so model
  validation doesn't reject them as unknown names.
- An unknown function name (`foo(1)`) is a parse error. Calling with zero
  arguments is a parse error.
- A bare identifier that isn't followed by `(` still resolves as a
  block/measurement reference.

**SQL three-valued logic for `&&` and `||`.** Null means "unknown":

| `a`   | `b`   | `a && b` | `a \|\| b` |
|-------|-------|----------|------------|
| false | null  | false    | null       |
| true  | null  | null     | true       |
| null  | null  | null     | null       |

The same holds with the operands swapped. Both sides are still evaluated. The
existing coercion stays: numbers become booleans, 0 is false. `!null` stays
null, which matches SQL.

**Unchanged:** arithmetic, comparisons, `==`/`!=`, unary operators and
`===`/`!==`.

### Behaviour change to flag at deploy

An existing expression like `sensor_ok && relay_wanted` that returned null
when one side was null (so the output write was skipped as `output_unknown`)
can now return `false`, and that `false` **is written to the relay**. This is
the intended SQL behaviour, but before deploying, check the production
diagrams for `&&`/`||` over inputs that can be null.

### Frontend

`extractLogicBlockReferences` (`frontend/src/logicDiagram.ts`) matches every
word against block names, so `coalesce` is harmless unless a block is named
`coalesce`. No frontend change is needed. The expression docs/help text, if
any, should mention `??` and `coalesce`.

### Implementation plan (red-green, RSpec)

1. Write failing specs in `spec/services/logic/expression_spec.rb`:
   - `??`: `null ?? 3 == 3`, `2 ?? 3 == 2`, `false ?? true == false`,
     `null ?? null` is null, chaining `null ?? null ?? 4 == 4`, precedence
     `null > 1 ?? false == false`, and laziness: `1 ?? unknown_name` does not
     raise.
   - `coalesce`: first non-null argument, all-null returns null, a single
     argument, case-insensitivity, laziness, nesting inside arithmetic
     (`coalesce(null, 2) * 3 == 6`), and parse errors for unknown functions
     and for `coalesce()`.
   - `references("coalesce(a, b) ?? c")` gives `[a, b, c]` and does not include
     `coalesce`.
   - Three-valued logic: the full truth table above, with numbers coerced
     (`0 && null == false`, `5 || null == true`).
   - Replace the existing `null && true` example (it stays null, so keep it
     as part of the table).
2. Add a model-level spec: a LogicBlock whose input is `coalesce(m, 0)` passes
   validation.
3. Implement it in `app/services/logic/expression.rb`: the tokenizer (`??`,
   `,`), `??` at precedence 1 with the existing levels shifted up by one, call
   parsing,
   lazy evaluation of `??`/`coalesce`, and the three-valued `&&`/`||`.
4. Update `claude/expression-types.md` and the overview.
5. Run the whole rspec suite and rubocop on the touched files.

### Status — implemented 2026-09-30 (uncommitted, undeployed)

Specs went red (18 failures) and then green; the full suite passes with 230
examples, and rubocop is clean on the touched files. The frontend has no
expression help text, so nothing changed there.

A read-only check of production (`GET :3001/output_blocks`) found four outputs
whose behaviour changes when one of their measurements is null:
`ThirdFloorRadValve` (`ThirdFloorCall && ThirdFloorIsHeat`), `FCUPump`,
`BoilerCH` and `RadCirc` (all use `||` across calls). Previously a single null
call skipped the write. Now a known `true` call drives the output on, and a
known `false` operand of `&&` drives it off. Production has no logic blocks.

## Phase 2 — TimerCounterLogicBlock

### Design

- `TimerCounterLogicBlock < LogicBlock`, `block_type: "timer_counter"`.
- One required input, `input`.
- `config.mode` is `active_high` (default) or `active_low`, validated like
  Hysteresis. The input is active when `truthy?(input)` is true for
  active_high, and when it is false for active_low.
- **Output:** the number of seconds since the input went active.
  - Inactive → `0.0`, and `active_since` is cleared.
  - The first trace that sees the input active sets `active_since` to that
    trace's `recorded_at` and outputs `0.0`. The edge is taken to be the
    trace time; latency is a separate, later task.
  - Each later active trace outputs `recorded_at - active_since`, clamped
    to ≥ 0. Because this is wall-clock time, the count keeps going across
    runner outages.
  - Null input → the output is `null`, and `active_since` is preserved so a
    brief dropout doesn't reset the timer (this matches Hysteresis/Latch
    retained state).
- **State:** `{ "active_since" => iso8601(6) string or nil }`.
- **Numeric block outputs:**
  - `BlockEvaluator#result_value` passes numbers through as floats and still
    maps true/false to 1.0/0.0.
  - `evaluate_logic` gains a `recorded_at:` keyword. The existing blocks
    accept it and ignore it.
  - The API exposes `input` and `output`. For this block, `output` is the
    numeric latest value; `LogicBlock#output` stays boolean for the other
    blocks.
- **Registration:** `LogicBlockApi::TYPES_BY_BLOCK_TYPE`,
  `Trace::RESULT_BUCKETS` and `RecordResources`.
- **Frontend:**
  - `store.ts` gets a `TimerCounterLogicBlockFields` type (`output: number |
    null`), and `output` moves from the base fields to each block type.
  - In `LogicTab.tsx`, the block form gets a "Timer Counter" type with the
    Active High/Low modes and the default expressions `{ input: '' }`.
  - The block card formats a numeric output as seconds and shows the `input`
    line.
- A separate TON block (a timer with a preset and a done output) is out of
  scope.

### Implementation plan (red-green, RSpec + vitest)

1. Write failing specs:
   - `spec/models/logic_block_spec.rb`: validation of mode/required input and
     `evaluate_logic` cases (inactive → 0, rising edge → 0 and sets
     `active_since`, elapsed seconds, falling edge → 0 and clears, null
     input → nil and preserves state, active_low inverted, clamp at 0).
   - `spec/services/logic/block_evaluator_spec.rb`: numeric values pass
     through unchanged.
   - `spec/services/logic/trace_evaluator_spec.rb`: over three traces at t0,
     t0+30s and t0+90s with the input active, the values are 0, 30 and 90.
     Then `timer > 60` drives an output to true, and the output falls back to
     false when the input goes inactive.
   - `spec/requests/logic_blocks_spec.rb`: create/serialize with
     `block_type: "timer_counter"`.
2. Implement the model, the evaluator changes and the registrations until the
   specs pass.
3. Frontend: types, form and card, plus a small vitest test if the form logic
   warrants one. Then `tsc` and the build.
4. Update the overview and `claude/logic-diagram.md`.
