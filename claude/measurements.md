# Measurements Task

## Design

A **Measurement** is a named value extracted from a device's `current_state.data` via a JSON path string (e.g. `temperatures[4]`). It has:
- `name` — user-facing label
- `device_id` — optional FK to devices for acquisition measurements
- `source_path` — JSON path into `current_state.data`
- `units` — optional string (e.g. "°C", "PSI")

Measurements are owned by a LogicDiagram. Acquisition measurements are sampled directly from the device's latest polled `current_state.data` when a Trace is created. Boolean device values are normalized to `1.0`/`0.0` in trace data.

## Implementation

### Backend
- Models: `Measurement` (app/models/measurement.rb)
- APIs: `MeasurementApi` (full CRUD)
- MeasurementApi expounds associated Devices

### Frontend
- Store: `Measurement` model definition in store.ts
- Dashboard: Measurement cards showing name, latest value, units, source info
- CRUD form: create/edit/delete measurements with device dropdown, source path input, mode, simulation value, and units

## Future Work
- **Computed measurements** — revisit whether computed inputs should be Measurements, LogicBlocks, or another diagram-owned source type.
- **Charts** — visualize trace-owned `data` history
