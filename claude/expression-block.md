# Expression Block

## Design

`ExpressionLogicBlock` (`block_type: "expression"`) is a named expression. In
effect it is a variable assignment that other blocks and outputs can
reference by name.

- One required input, `value`. No config. It is stateless.
- The block's value is whatever `value` evaluates to, stored as-is in the
  trace `value`: numbers, `true`/`false` and null. *Revised after review:* an
  earlier draft stored booleans as 1.0/0.0 like other blocks. Booleans are
  valid expression outputs, so `x === true` holds downstream. Hysteresis,
  Latch and Timer Counter keep storing 1.0/0.0.
- The coercion moved from `BlockEvaluator#result_value` to
  `LogicBlock#trace_value`, and `ExpressionLogicBlock` overrides it to keep
  booleans. The block keeps no state (`{}`).
- API: `value_fields_for` exposes `value` (the evaluated input) and `output`
  (the trace value).
- Hysteresis coerces boolean inputs to 1/0 through `LogicBlock#numeric`.
  Before, `true.to_f` raised and failed the whole trace, which boolean
  expression blocks made much more likely.
- It is registered in `LogicBlockApi`, `Trace::RESULT_BUCKETS` and
  `RecordResources`.
- Frontend:
  - `ExpressionLogicBlockFields` has `output: number | boolean | null`, and
    `BaseLogicBlockFields.latest_value` widens to `number | boolean | null`.
  - The form gets an "Expression" type with no mode select and the default
    expressions `{ value: '' }`.
  - The card shows `formatComputedValue(output)`.
  - `MODES_BY_TYPE` allows an empty list, and the Mode select is hidden when
    that list is empty.
  - `config` is sent as `{}`.

### Division by zero → null

Today `x / 0` produces `Infinity` or `NaN`. Downstream expressions in the same
trace see that value in memory, but the JSONB column stores it as null, so the
two disagree. With this change `/` returns null when the divisor is 0, which
matches the rest of the null-propagation rules. This goes in
`Logic::Expression` and is noted in `claude/expression-types.md`.

## Implementation plan (red-green)

1. Write failing specs:
   - `expression_spec`: `1 / 0` and `0 / 0` return null, `1 / 0 ?? 5` returns
     5, and `6 / 3` is still 2.
   - `logic_block_spec`: the block requires `value`, and `evaluate_logic`
     passes through numbers, booleans and null as `[value, {}]`. A boolean
     Hysteresis input is treated as 1/0.
   - `trace_evaluator_spec`: an expression block with `a * 2` over a
     simulation measurement stores its number, and one with `a > 1 && true`
     stores `true`, including after reload. A downstream output referencing the
     block evaluates correctly, and a later block (stratum 2) can reference an
     expression block.
   - `logic_blocks_spec` (request): create with `block_type: "expression"`;
     `output` serializes as a boolean or a number.
   - `model_store_channel_spec`: resource mapping.
   - Vitest: the form creates an expression block with `config: {}` and
     `input_expressions: { value: ... }`, and hides Mode.
2. Implement the backend, then the frontend, until everything passes. Run
   rubocop on touched files, tsc and the build.
3. Update `claude/logic-diagram.md`, `claude/expression-types.md` and
   `claude/overview.md`.

## Status — implemented 2026-09-30, deployed in `bfe5af0`

The backend specs and frontend tests were written first and failed, then
passed once implemented: RSpec 246 examples, vitest 51. tsc and the build are
clean. Rubocop found nothing new; the 4 offenses in `spec/drivers` and
`spec/support` were already there.
The Mode select is hidden for types whose `MODES_BY_TYPE` list is empty. The UI
hasn't been checked in a real browser.
