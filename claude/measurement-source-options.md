# Measurement source options

## Design

An acquisition Measurement's `source_path` is selected from the input catalog
declared by the selected Device's driver. It is not inferred from
`current_state.data`: that
data may be absent before the first successful poll, may contain only a partial
sample, and can include fields such as relay outputs that are not valid
measurement inputs.

At the hardware and Device API layers, the vocabulary is strictly `inputs` and
`outputs`. A driver exposes stable input and output catalogs; it does not know
about Measurements or measurement sources. The logic-diagram UI translates a
selected Device input into a Measurement's source path.

Each input item contains:

- `path`: the persisted lookup path, such as `inputs[0]` or `temperatures[3]`.
- `label`: operator-facing text using one-based channel numbering.
- `value_type`: `boolean` or `number`, for truthful UX metadata and future use.
- `units`: the driver's natural unit, or `null` for unitless values.

An output item uses the same operator-facing metadata where applicable, plus its
one-based `channel`, matching the existing OutputBlock contract. `DeviceApi#serialize`
includes both driver-derived catalogs as `inputs` and `outputs` on every Device.
This
keeps the frontend dependent on the Device API rather than duplicating knowledge
of driver classes or channel counts. The metadata is capability information and
does not depend on whether the device is currently online.

For example, a relay Device response will have this shape (other existing fields
are included to make the wire format explicit):

```json
{
  "id": 3,
  "name": "Relay board",
  "host_interface_id": 1,
  "modbus_address": 1,
  "driver": "Drivers::N4D8B08",
  "configuration_revision": 7,
  "last_polled_at": "2026-09-27T16:05:12Z",
  "current_state": {
    "status": "ok",
    "error": null,
    "polled_at": "2026-09-27T16:05:12Z",
    "data": {
      "inputs": [false, true, false, false, false, false, false, false],
      "outputs": [false, false, false, false, false, false, false, false]
    }
  },
  "inputs": [
    { "path": "inputs[0]", "label": "Input 1", "value_type": "boolean", "units": null },
    { "path": "inputs[1]", "label": "Input 2", "value_type": "boolean", "units": null },
    { "path": "inputs[2]", "label": "Input 3", "value_type": "boolean", "units": null },
    { "path": "inputs[3]", "label": "Input 4", "value_type": "boolean", "units": null },
    { "path": "inputs[4]", "label": "Input 5", "value_type": "boolean", "units": null },
    { "path": "inputs[5]", "label": "Input 6", "value_type": "boolean", "units": null },
    { "path": "inputs[6]", "label": "Input 7", "value_type": "boolean", "units": null },
    { "path": "inputs[7]", "label": "Input 8", "value_type": "boolean", "units": null }
  ],
  "outputs": [
    { "channel": 1, "label": "Relay 1", "value_type": "boolean", "units": null },
    { "channel": 2, "label": "Relay 2", "value_type": "boolean", "units": null },
    { "channel": 3, "label": "Relay 3", "value_type": "boolean", "units": null },
    { "channel": 4, "label": "Relay 4", "value_type": "boolean", "units": null },
    { "channel": 5, "label": "Relay 5", "value_type": "boolean", "units": null },
    { "channel": 6, "label": "Relay 6", "value_type": "boolean", "units": null },
    { "channel": 7, "label": "Relay 7", "value_type": "boolean", "units": null },
    { "channel": 8, "label": "Relay 8", "value_type": "boolean", "units": null }
  ]
}
```

The relay's actuator channels appear under `outputs`, never under `inputs`, so
they cannot become Measurement source options. N4DSC08 exposes
`temperatures[0]` through `temperatures[7]` as inputs; NT48C32 exposes
`temperatures[0]` through `temperatures[31]` as inputs. Both temperature drivers
label these `Temperature 1`, etc., with `value_type: "number"` and `units: "°C"`,
and expose an empty `outputs` list.

A driver declaration can stay small and explicit:

```ruby
def self.inputs
  CHANNEL_COUNT.times.map do |index|
    {
      path: "inputs[#{index}]",
      label: "Input #{index + 1}",
      value_type: "boolean",
      units: nil
    }
  end
end
```

The form derives the selected Device and renders its catalog as a single-choice
`select` (a measurement has one source, so a multi-select control would be the
wrong data model):

```tsx
const selectedDevice = foundDevices.find(
  (device) => device.id === Number(deviceId),
);
const sourceOptions = selectedDevice?.inputs ?? [];

<select
  value={sourcePath}
  disabled={!selectedDevice}
  onChange={(event) => setSourcePath(
    (event.target as HTMLSelectElement).value,
  )}
>
  <option value="">Select input...</option>
  {sourceOptions.map((source) => (
    <option key={source.path} value={source.path}>
      {source.label}{source.units ? ` (${source.units})` : ''}
    </option>
  ))}
</select>
```

Changing Device clears `source_path`, because paths happen to share names across
some drivers but must not silently retain their old meaning. Editing an existing
record preserves its current valid selection. The source selector is disabled
until a Device is selected. For an acquisition record, Save is disabled until a
Device and source are selected. Simulation records may continue to have neither.
The existing Units field remains editable; selecting a source supplies its
natural units only when Units is blank, avoiding an unrelated behavior change.

The model also validates the persisted pairing. If either `device_id` or
`source_path` is supplied for an acquisition Measurement, both must be supplied,
and the path must occur in that Device driver's catalog. Fully unassigned
acquisition Measurements remain valid for the existing design-before-hardware
workflow, even though the creation form guides ordinary acquisition creation to
a complete selection. This closes the API loophole without invalidating existing
unwired records.

An alternative is to derive options in the browser from the existing global
Drivers response (`fields` plus `channel_count`). That representation is too
lossy: it treats every field as having the same channel count, cannot distinguish
inputs from outputs, and would duplicate path/label/unit construction in the
frontend. Device-level, driver-declared input/output catalogs are the cleaner
contract.

## Implementation Plan

1. Add failing RSpec examples for driver input/output catalogs, Device API
   serialization, and Measurement rejection of incomplete or unsupported
   device/path pairs while retaining a fully unassigned acquisition record.
2. Add `inputs` and `outputs` to the driver contract and implement them for
   N4D8B08, N4DSC08, and NT48C32. Serialize the selected driver's catalogs from
   `DeviceApi` and reuse the input catalog in Measurement validation and
   `HardwareConfiguration.compatible!` so these rules have one source of truth.
3. Add typed `inputs` and `outputs` structures to `DeviceFields`.
4. Add a failing jsdom component test for the Measurement form: no free-form
   path input, source options change with Device, device changes clear the
   selection, and the saved payload contains the enumerated path.
5. Replace the Source Path text input with the Device-dependent select, display
   labels/units, seed blank Units from source metadata, and enforce the form
   availability rules described above. Export only the smallest component or
   helper needed for focused testing.
6. Refactor after the tests pass, then run the focused RSpec/Vitest suites,
   complete RSpec and frontend tests, TypeScript checking, and the frontend
   production build.

## Confirmation

Device-level nomenclature revised to `inputs` and `outputs` from user feedback.
User confirmed implementation on 2026-09-27.

## Implementation Notes

- Added driver-declared `inputs` and `outputs` catalogs for all three supported
  drivers and exposed those catalogs in every serialized Device.
- Centralized input/output compatibility checks on Device. Measurement saves,
  locked hardware-reference checks, OutputBlock validation, and hardware driver
  changes now use the same catalogs.
- Extracted `MeasurementForm` into a focused component and replaced the
  free-form source path with a Device-dependent select. Device changes clear the
  source, temperature selection seeds blank units, and acquisition creation
  requires a complete Device/input pair.
- Preserved fully unassigned acquisition Measurements and simulation records for
  design-before-hardware use.
- Verification: 185 RSpec examples and 34 frontend tests pass; TypeScript
  checking, frontend production build, and `git diff --check` pass.
