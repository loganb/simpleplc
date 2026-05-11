# Expression Types

## Design

The expression language should have four runtime value types:

- number
- true
- false
- null

Boolean values coerce to numbers when used with mathematical or numeric comparison operators:

- true coerces to 1
- false coerces to 0

Numbers coerce to booleans when used with boolean operators:

- 0 coerces to false
- non-zero numbers coerce to true

Null follows SQL-like propagation for ordinary operators. If any operand of a regular unary or binary operator is null, the result is null. This keeps null distinct from false and 0, and leaves room for null-specific functions or operators later.

Equality has two modes:

- `==` and `!=` use coercion, so `true == 1` is true and `false == 0` is true.
- `===` and `!==` are exact, so `true === 1` is false and `true !== 1` is true.

Expected result categories:

- Math operators return number or null.
- Boolean operators return true/false or null.
- Numeric comparisons return true/false or null.
- Coercive equality returns true/false or null when either side is null.
- Exact equality returns true/false, including exact comparisons against null.

## Trace Result Context

The latest committed trace refactor stores computation output in `Trace#results` JSON instead of polymorphic `Datum` rows. Expression evaluation now reads named references through `Logic::EvaluationContext`, which can use either persisted `trace.results` or an in-memory results hash while `Logic::TraceEvaluator` is still building a trace.

That means expression type changes must preserve JSON-compatible values in result payloads:

- numbers serialize as JSON numbers
- true/false serialize as JSON booleans in `input_values` and state
- null serializes as JSON null

Block and output evaluators return result payload hashes. They should not create records directly, and any null behavior must be visible in `trace.results`.

## Implementation Plan

1. Add failing RSpec examples for the expression evaluator:
   - booleans in math: `true + 2 == 3`, `false * 10 == 0`
   - numbers in boolean operators: `5 && true`, `0 || false`, `!0`
   - null propagation through math, boolean, and numeric comparison operators
   - coercive equality: `true == 1`, `false == 0`, `true != 1`
   - exact equality: `true === 1`, `true !== 1`, `null === null`
   - null coercive equality returns null for `null == 0` and `null != false`
2. Add focused trace-result specs for JSON storage:
   - an expression input that evaluates to null is stored as JSON null in `trace.results`.
   - a block/output input expression using boolean/number coercion stores the operator result with the correct JSON type.
   - references read from the in-memory trace results during `TraceEvaluator` execution, not only from already-persisted traces.
3. Update `Logic::Expression` tokenization and precedence to recognize `===` and `!==` before shorter equality tokens.
4. Refactor evaluator coercion helpers:
   - `numeric(value)` accepts numbers and booleans, but not null.
   - `boolean(value)` accepts booleans and numbers, but not null.
   - ordinary operators return null before coercing when any operand is null.
   - coercive equality compares coerced numeric values when either side is a number/boolean pair, and returns null when either side is null.
   - exact equality compares raw Ruby values without coercion.
5. Update expression consumers for the new null semantics:
   - `LogicBlock#truthy?` should no longer treat null as false without the caller choosing that fallback.
   - `LatchLogicBlock` should preserve its retained internal state when set or reset is null, but the current output should be null. A null cycle must not overwrite the retained state with null. When inputs reappear, evaluation resumes from the last non-null retained state for continuity.
   - `HysteresisLogicBlock` numeric inputs currently use `to_f`, which would collapse null to 0. If value, low_limit, or high_limit is null, preserve the retained internal state, emit null as the current output, and store the null input in `trace.results`. A null cycle must not overwrite the retained state with null. When inputs reappear, evaluation resumes from the last non-null retained state for continuity.
   - `Logic::OutputEvaluator` should treat null output expressions as unknown desired output. Desired/effective output should be null and `write_pending` should be false, so null inputs do not write hardware.
   - `OutputBlock#desired_output`, `#effective_output`, and `Logic::OutputWriter` should respect null result values and avoid mapping null to false/close.
6. Update documentation in `claude/overview.md` after implementation to describe trace JSON result values and expression null semantics.
7. Run focused specs with the project runtime:
   - `mise exec -- bundle exec rspec spec/services/logic spec/models/logic_block_spec.rb spec/models/output_block_spec.rb spec/models/measurement_spec.rb spec/requests/traces_spec.rb`

## Confirmation

Confirmed and implemented on 2026-05-11.

Implementation notes:

- `Logic::Expression` now supports `===` and `!==`, coercive `==`/`!=`, boolean/number coercion, and null propagation for ordinary operators.
- `HysteresisLogicBlock` and `LatchLogicBlock` emit null when required inputs are null but preserve the retained `"output"` state from the last non-null cycle.
- `Logic::OutputEvaluator` records null desired/effective output and `write_pending: false` when an output input is null.
- `OutputBlock` and `Logic::OutputWriter` skip hardware writes for null desired output.
