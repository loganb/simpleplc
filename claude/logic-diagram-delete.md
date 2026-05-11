# Logic Diagram Delete

## Design

Logic Diagrams need a delete button in the frontend. Deleting a diagram is broader than deleting a block, measurement, or output because the Rails model has dependent destroys for logic blocks, measurements, output blocks, and traces. The UI should therefore use a browser confirmation before sending the destroy request.

The delete control should apply to the currently selected diagram and live near the existing Logic Diagram actions. If the user confirms, the frontend should call the existing RestfulModelStore destroy path for `LogicDiagram`, close open child forms, and refresh/select cleanly after the transaction succeeds.

## Implementation Plan

1. Add state handling in `LogicDiagramsSection` for a diagram delete transaction and its error/status.
2. Add a Delete Diagram button beside the other Logic Diagram controls, disabled while the delete request is pending.
3. Prompt with `window.confirm` before deleting, with copy that makes the cascade explicit.
4. On successful deletion, close diagram/block/output/measurement forms, clear the current selection, and refresh cached data.
5. Add or adjust RSpec coverage for deleting a logic diagram and cascading child records if the backend behavior is not already covered.
6. Run the relevant RSpec and frontend test/build commands.

## Implementation Notes

- Added a Delete Diagram button for the currently selected diagram.
- The button uses `window.confirm` and explicitly warns that measurements, blocks, outputs, and traces are deleted with the diagram.
- Successful deletion closes open logic-diagram child forms, clears the selected diagram, and triggers a frontend refresh.
- Added request coverage that `DELETE /logic_diagrams/:id` removes dependent measurements, logic blocks, output blocks, and traces.
- Delete transactions now carry a pending `seq`, matching create/patch, so `useTxnStatus()` can wake up when destroy completes.

## Follow-Up Notes

- Fixed `RestfulModelStore.destroy()` so failed DELETE requests write an error transaction result into `this.txns`, mirroring `create()` and `patch()`. This lets `txn_status()` report destroy failures to callers.
