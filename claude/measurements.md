# Measurements Task

## Design

A **Measurement** is a named value extracted from a device's `current_state.data` via a JSON path string (e.g. `temperatures[4]`). It has:
- `name` — user-facing label
- `device_id` — optional FK to devices for acquisition measurements
- `source_path` — JSON path into `current_state.data`
- `units` — optional string (e.g. "°C", "PSI")
- `measurement_data` — has_many timestamped float values (NULL = no reading)

Measurements are owned by a LogicDiagram. Measurement sampling from the poller has been removed; Trace creation is now the intended path for evaluating diagram values.

## Implementation

### Backend
- Models: `Measurement` (app/models/measurement.rb), `MeasurementDatum` (app/models/measurement_datum.rb, table: measurement_data)
- APIs: `MeasurementApi` (full CRUD), `MeasurementDatumApi` (index/show/create only, supports time windowing via since/until/limit params)
- MeasurementApi expounds associated Devices
- MeasurementDatumApi by_query requires measurement_id, defaults to limit=100, max 1000

### Frontend
- Store: `Measurement` and `MeasurementDatum` model definitions in store.ts
- Dashboard: Measurement cards showing name, latest value, units, source info
- CRUD form: create/edit/delete measurements with device dropdown, source path input, mode, simulation value, and units

## Future Work
- **Trace-driven acquisition** — decide whether creating traces should sample device current_state directly or use a separate acquisition history.
- **Computed measurements** — revisit whether computed inputs should be Measurements, LogicBlocks, or another diagram-owned source type.
- **Data retention** — purge/downsample old measurement_data
- **Charts** — recharts integration to visualize measurement_data history
