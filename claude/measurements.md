# Measurements Task

## Design

A **Measurement** is a named value extracted from a device's `current_state.data` via a JSON path string (e.g. `temperatures[4]`). It has:
- `name` — user-facing label
- `source_type` — currently always `"device"`, future: `"expression"` for computed values
- `device_id` — FK to devices (required when source_type=device)
- `source_path` — JSON path into `current_state.data`
- `update_period` — seconds between readings
- `units` — optional string (e.g. "°C", "PSI")
- `measurement_data` — has_many timestamped float values (NULL = no reading)

## Implementation

### Backend
- Models: `Measurement` (app/models/measurement.rb), `MeasurementDatum` (app/models/measurement_datum.rb, table: measurement_data)
- APIs: `MeasurementApi` (full CRUD), `MeasurementDatumApi` (index/show/create only, supports time windowing via since/until/limit params)
- MeasurementApi expounds associated Devices
- MeasurementDatumApi by_query requires measurement_id, defaults to limit=100, max 1000

### Frontend
- Store: `Measurement` and `MeasurementDatum` model definitions in store.ts
- Dashboard: Measurement cards showing name, latest value, units, source info
- CRUD form: create/edit/delete measurements with device dropdown, source path input, update period, units

## Future Work
- **Poller integration** — actually write measurement_data on each poll cycle by evaluating source_path against device current_state
- **Computed measurements** — source_type="expression" with mathematical expressions combining other measurements
- **Data retention** — purge/downsample old measurement_data
- **Charts** — recharts integration to visualize measurement_data history
