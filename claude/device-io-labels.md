# Device I/O labels

## Requested outcome

Move Device editing out of the inline Devices page flow and into a modal dialog. In that dialog, show every input and output declared by the selected Device driver and allow an operator to give each one a custom label. If no custom label is stored, the driver-defined label remains the default. Use those effective labels anywhere hardware inputs and outputs are selected or identified in LogicDiagrams.

Task name: `device-io-labels` (proposed; awaiting user confirmation together with this plan).

## Design

### Persistence and identity

Add one non-null `jsonb` column to `devices`, named `io_labels`, with an empty-object default. Store only user overrides, not copies of every driver default:

```json
{
  "inputs": {
    "inputs[0]": "Boiler enable",
    "temperatures[3]": "Return air"
  },
  "outputs": {
    "1": "Supply fan",
    "4": "Alarm relay"
  }
}
```

Input paths and output channel numbers remain the durable identifiers used by Measurements and OutputBlocks. Labels are presentation metadata only. This means renaming a label does not rewrite or invalidate an existing LogicDiagram.

The Device model will merge overrides onto the current driver's input/output catalogs before the API serializes them. An absent or blank override falls back to the driver's label. Persist only trimmed, nonblank overrides whose keys exist in the selected driver's catalog; unknown or stale keys are discarded, including when the driver changes. Put a reasonable maximum length on each label and reject malformed JSON shapes rather than allowing arbitrary nested data.

`io_labels` should participate in the existing Device `configuration_revision` check so a stale update fails instead of silently replacing newer labels. The frontend does not need conflict-specific comparison, merging, or recovery behavior; it will display a stale-write response through the same error path as any other failed save. Separate the Device fields that advance its operator-edit revision from the physical fields that advance the parent bus revision: a label-only update must remain a live metadata edit, must not require disabling the bus, and must not make the poller reconnect or reconfigure hardware.

### API

Permit `io_labels` on Device create/update using explicit nested strong parameters. Serialize `io_labels` as the stored override map and continue serializing `inputs` and `outputs` as the effective catalogs with custom/default labels already resolved.

Keep the existing catalog metadata (`path` or `channel`, `value_type`, and `units`) driver-owned and non-editable. Backend model/request coverage, rather than only frontend filtering, will enforce the accepted label shape and known catalog keys.

### Device modal

Open the Device form in an accessible modal layer instead of inserting it above the device cards. The modal will have a labelled heading, modal semantics, initial focus, Escape/cancel handling, focus containment/restoration, and a scrollable body for drivers with many channels. Saving, deletion review, loading, and ordinary error states stay inside the dialog so the underlying Devices page does not shift.

Use the same modal shell for both New Device and Edit Device for consistency. The Drivers endpoint includes each driver's read-only input/output catalogs, so choosing a driver immediately renders the label editor for both new and existing Devices. This also lets the rows refresh correctly if the selected driver changes.

In Edit Device, render separate Inputs and Outputs sections. Each row shows the stable path/channel and the driver default, plus a text input whose empty value means “use the default.” Changing the driver refreshes the displayed catalog and drops overrides that do not belong to the newly selected driver. Saving submits hardware fields and the compact override map together.

### LogicDiagram presentation

The Measurement source selector already reads `device.inputs[].label`; it will automatically receive effective custom labels from the Device API. Retain the stable source path as the option value and show it as secondary context where useful.

Replace the OutputBlock form's free numeric channel input with a selector populated from the chosen Device's declared outputs. Display each effective label with its channel number, retain the numeric channel as the saved value, clear/revalidate the channel when the Device changes, and disable save until a valid output is selected. Update Measurement and Output cards to display the effective label alongside the stable path/channel so existing assignments are easier to recognize without becoming label-dependent.

## Red-green implementation plan

1. Add failing model and request specs for Device I/O label behavior:
   - empty/missing overrides return driver defaults;
   - input-path and output-channel overrides replace only `label` in effective catalogs;
   - blank labels collapse back to defaults and are not stored;
   - malformed/overlong values are rejected while blank, unknown, and stale entries are removed by normalization;
   - changing drivers cannot expose stale labels;
   - label-only edits work while the interface is enabled and do not invoke hardware quiescing;
   - stale revisions fail through the ordinary save-error path rather than silently overwriting labels;
   - existing Measurement `source_path` and OutputBlock `channel` values remain unchanged after a rename.
2. Add the `devices.io_labels` JSONB migration, Device normalization/validation and effective-catalog merging, then expose the field through `DeviceApi` until the backend specs pass.
3. Add failing frontend tests for modal Device editing: opening from a card, dialog semantics and close behavior, loaded input/output rows, defaults versus custom drafts, compact label payloads, preserved drafts/generic save errors, and the existing deletion flow inside the modal.
4. Introduce the modal shell and move the Device editor into it without moving HostInterface editing. Add the two label lists to the edit state and submit `io_labels` with the existing Device update.
5. Add failing frontend tests for LogicDiagram consumers: Measurement source options show custom/default labels while saving the path; OutputBlock options enumerate only the selected Device's outputs, show custom/default labels, reset on Device change, and save the numeric channel; cards resolve stored assignments back to effective labels.
6. Implement the LogicDiagram selector/card changes. Keep all backend evaluation and output-writing code keyed by path/channel, with no label lookup in runtime logic.
7. Run focused RSpec and Vitest during red-green cycles, then run the full RSpec suite, full frontend test suite, TypeScript checking, and frontend production build. Perform a browser smoke check of modal focus/scrolling and a relay Device with eight inputs/eight outputs.
8. Update `claude/overview.md` after implementation with the final storage contract, modal behavior, LogicDiagram label usage, verification results, and any deliberate deviations from this plan.

## Scope boundaries

- No normalized input/output-label table.
- No migration of Measurement or OutputBlock identities to labels.
- No label-driven changes to polling, logic evaluation, or hardware writes.
- HostInterface editing remains inline; only Device editing is in scope.
- No production deployment is implied by implementation approval.

## Confirmation

The user approved implementation with “Okay, let's go” on 2026-09-29. The user also clarified that concurrent-modification failures need no special UI and should follow the ordinary save-error path.

## Implementation notes

- Added `devices.io_labels` as non-null JSONB with `{}` default. Only trimmed, nonblank overrides for the active driver catalog are retained.
- Device API catalogs now merge overrides over driver defaults. The Drivers endpoint exposes default catalogs so the modal can render rows before creation and immediately after a driver selection.
- Label edits advance the Device configuration revision but not the parent HostInterface revision, do not quiesce the bus, and do not affect polling or hardware writes.
- Device create/edit now uses an accessible modal with focus containment/restoration, Escape and backdrop dismissal, and a scrollable body.
- LogicDiagram Measurement sources continue to save paths while displaying effective input labels. Output editing now enumerates the selected Device's outputs and saves the numeric channel; Measurement and Output cards resolve saved identities back to effective labels.
- OutputBlockForm was split into its own component to keep the enumerated-output behavior directly testable.
- The implementation improved on the initial draft by exposing driver catalogs and allowing labels during Device creation rather than requiring a save-and-reopen cycle.
- Development schema migrated. Production was not migrated or deployed.
- Verification: 202 RSpec examples, 37 Vitest tests, TypeScript check, frontend production build, and `git diff --check` passed. A browser smoke check was not run because no local Rails or frontend server was listening.
