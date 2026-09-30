# Logic Block Notes

## Design

Each LogicBlock gets a freeform `notes` field for documenting the logic.

- `logic_blocks.notes`: `text`, default `""`, non-null. No validation. It is
  plain text, not Markdown, and has no effect on evaluation or traces.
- It lives on the `LogicBlock` base table, so every STI type has it, and it
  survives a `block_type` change (`becomes!`).
- API: `LogicBlockApi` serializes `notes` and permits it on create/update.
- Frontend:
  - `BaseLogicBlockFields.notes: string`.
  - `LogicBlockForm` has a "Notes" textarea below Input Expressions, and it
    always sends `notes` on save.
  - `LogicBlockCard` shows the notes under the header when they aren't blank,
    with `whitespace-pre-wrap` so line breaks survive.

Out of scope: notes on Measurements, OutputBlocks and LogicDiagrams.

## Implementation plan

1. Migration `AddNotesToLogicBlocks`; migrate dev and test.
2. `LogicBlockApi#serialize` and `#create_params`.
3. Request spec: create with notes, confirm the round trip, then patch it.
4. Frontend type, form textarea and card display; form test for notes.
5. rspec, vitest, tsc, build.
