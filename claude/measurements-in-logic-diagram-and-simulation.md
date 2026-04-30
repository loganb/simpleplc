# measurements-in-logic-diagram-and-simulation

## Design

Measurements become part of a LogicDiagram instead of global application inputs. A Measurement can be an acquisition value backed by device sampling, or a simulation value entered directly by the user so a conceptual diagram can be built and forced through states before hardware exists.

Trace is the explicit CRUD object for "compute this LogicDiagram now." Creating a Trace synchronously snapshots every diagram Measurement into `data`, then evaluates LogicBlocks by `stratum ASC, id ASC`, writing one Datum per block into the same Trace. `measurement_data` remains raw acquisition history; `data` becomes the per-Trace snapshot/computation table for Measurements, LogicBlocks, and eventually Outputs.

Expression references remain name-based and expression-safe. Resolution is scoped to the Trace's LogicDiagram and reads values from the current Trace's data so a computation is internally consistent.

## Implementation Plan

1. Add migrations for diagram-owned measurements, measurement modes, traces, and `data.trace_id`; destructively clear existing diagram/block/data records during the migration and assign legacy measurements to a default diagram.
2. Update backend models and services:
   - Measurement belongs to LogicDiagram, has acquisition/simulation validation, and can produce a trace value.
   - LogicDiagram owns measurements and traces.
   - Trace triggers synchronous computation after create.
   - Datum belongs to Trace and polymorphic source.
   - EvaluationContext and BlockEvaluator resolve against a Trace.
3. Update APIs/routes for measurements, logic diagrams, data, and traces.
4. Update RSpec coverage for measurement scoping/modes, trace computation, scoped references, and request behavior.
5. Update frontend store types and App UI:
   - measurements live under selected diagram
   - measurement form includes acquisition/simulation controls
   - logic diagram toolbar gets Compute Now button
   - cards show latest trace values where available
6. Run RSpec, Vitest, and frontend build; fix regressions.

## Confirmation

User explicitly asked: "PLEASE IMPLEMENT THIS PLAN" on 2026-04-30, after the plan was discussed and confirmed in Plan Mode.

## Implementation Notes

- Added Trace as the synchronous computation boundary and added trace-owned Datum rows for Measurement snapshots and LogicBlock computations.
- Measurements now belong to LogicDiagrams, have acquisition/simulation modes, and allow acquisition records without a device/sample.
- Expression resolution is diagram scoped and Trace scoped.
- The frontend now manages Measurements inside the selected LogicDiagram and has a Compute Now button that creates a Trace.
- Follow-up: moved measurement sampling cadence to LogicDiagram as `update_period` and removed Measurement-level `update_period`.
- Follow-up: removed poller-driven measurement recording and the now-unused Measurement sampling helpers.
- Follow-up: removed the Measurement-level `source_type` column; mode plus optional device/source path now describe measurement behavior.
- Follow-up: measurement cards now expose mode toggling and inline simulation value editing without opening the edit form.
- Verification after implementation:
  - `mise exec -- bundle exec rspec`
  - `mise exec -- npm test`
  - `mise exec -- npm run build`
