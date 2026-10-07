# WJ150 Pulse Counter Driver

Datasheet: `doc/hardware/WJ150/WJ150-EN.pdf` (WAYJUN WJ150-485, v1.1).
Use: count pulses from two flow sensors, each channel used independently.

**Status: implemented (backend, frontend, specs). Not yet verified on hardware; the three datasheet checks above are still open.**

## Hardware facts (Modbus RTU only; we ignore the `$`/`#` character protocol)

Default 9600 8N1, address 1. Holding registers only (FC 03/06/16); offsets are
the "PC/DCS" column, i.e. what ruby-modbus takes.

| Offset | Meaning | Notes |
| --- | --- | --- |
| 0 | working mode | 0 = AB encoder (factory), **1 = two independent counters**. Needs power cycle |
| 32–33, 34–35 | A0 / B0 count, uint32 | **low word first**. Write to set or clear |
| 40, 41 | A0 / B0 pulses per rev | speed scaling only; we don't need it |
| 67 | count clear | write 20 = A0, 21 = B0, 22 = both; self-resets to 0 |
| 80 | save count over power loss | default 1 |
| 81 | DI pull-up | 0 off (default), 1 on. **Needed for NPN / dry-contact / reed flow sensors** |
| 108, 109 | A0 / B0 speed | uint16, needs pulses/rev. Not used |
| 144–145, 146–147 | A0 / B0 frequency, Hz | float32, low word first |
| 180, 181 | A0 / B0 filter ms | 0 for optical, 20–100 for reed/mechanical. Needs power cycle |
| 200 | **module address** | 0–255 (we use 1–247). Needs power cycle |
| 201 | baud code | 4=2400 … 6=9600 … 10=115200. Power cycle |
| 202 | parity | 0 none, 1 odd, 2 even. Power cycle |
| 210 | product ID | read-only, `0x0150` → unique identity for discovery |
| 88 | factory reset | write 0xFF00. Never exposed |

Count edge (coils 0/1) is also configurable, rising by default; coil support
is not needed for v1.

Things to verify on the real module before trusting the datasheet:
- float32 word order for frequency (datasheet says low word first, which is
  the opposite of IEEE big-endian convention).
- Whether register 200 reads back the *new* value before the power cycle
  (decides how we detect "written, awaiting power cycle").
- Whether the module in mode 0 returns zeros on 32–35 (FAQ #7 says yes), which
  is how a wrong mode shows up.

## Driver: `Drivers::WJ150` (`app/drivers/drivers/wj150.rb`)

- `display_name` "WJ150 2-Ch Pulse Counter", `channel_count` 2. Register it in
  `Drivers::Registry.all`.
- `device_support(probe)`: read holding 210. `0x0150` → "yes". Other value →
  "no". Not readable → "maybe". Same shape as `NT48C32`. Registry
  `configuration_effects` text updated if the driver ever writes on
  `configure!`.
- `inputs` (all `value_type: "number"`):
  - `counts[0]`, `counts[1]` — "Channel A / B count", units `pulses`
  - `frequencies[0]`, `frequencies[1]` — "Channel A / B frequency", units `Hz`
- `read` → `{ counts: [a, b], frequencies: [a, b], mode: 1 }`. One FC 03 read
  of 32..35 and one of 144..147 (two round trips; the registers aren't
  contiguous). Raises on a short read, like the other drivers.
  - If mode (offset 0) isn't 1 the counts are meaningless. Reading mode every
    cycle is a third round trip; instead read it in `configure!` and have
    `read` raise "WJ150 is in encoder mode; set working mode to 1" so the
    problem surfaces as a device error rather than as silent zeros.
- No outputs. `outputs` stays `[]`; counter clear is a configuration action,
  not a logic output.
- `configure!` follows the base contract (explicit setup, never in
  constructors or discovery). It must **not** write EEPROM-backed registers
  unconditionally every time the bus comes online. Compare, then write only
  what differs.
- Scaling pulses → flow (K-factor, L/pulse) is **not** in the driver. Drivers
  expose raw readings; scaling belongs in an Expression block in the logic
  diagram (`counts[0] / k`, `frequencies[0] * 60 / k`). Revisit if you want a
  per-channel K-factor as a device setting so it shows up in the UI.
- 32-bit counters wrap at 4,294,967,295. Totalisers should be fine; rate from
  count deltas in logic would need wrap handling. Frequency is the better
  source for instantaneous flow. Noted, not solved here.

## Online device configuration (decided: declarative settings, driver-reconciled)

Constraints: no device-specific logic outside the driver; no bus holding or
scan-style state machine; "written, then offline until someone power cycles
it" is acceptable.

- `devices.settings` (jsonb, default `{}`) holds the operator's *desired*
  driver settings. A key that is absent is **unmanaged**: the driver leaves
  that register alone, so adopting a pre-configured module never overwrites it.
- Drivers declare a schema, `Base.settings_schema` (default `[]`): entries of
  `{ key, label, type: "boolean"|"integer", min, max, requires_power_cycle, help }`.
  `Base.normalize_settings(raw)` validates against it (unknown key, wrong type,
  out of range → `ArgumentError`); `Device` calls it in validation. The schema
  is exposed through `Registry.metadata` so the UI renders the form generically.
  `Registry.metadata` also takes `configuration_effects` from a driver class
  method instead of special-casing N4D8B08.
- `Poller::Connection#driver_for` already rebuilds and re-runs `configure!`
  when the cache fingerprint changes. The fingerprint becomes
  `[driver, modbus_address, settings]`, so editing settings is picked up on
  the next cycle with no new state. `settings` is a configuration field
  (bumps `configuration_revision`) but **not** structural: editing it does not
  require disabling the bus.
- `WJ150#configure!` reads each managed register and writes only on mismatch
  (EEPROM-friendly). The working mode is not a setting: this driver always
  needs mode 1 and ensures it.
- `WJ150#read` reads the mode register every cycle and raises
  "set to encoder mode, power-cycle the module" when it isn't 1, so the card
  shows a clear error instead of zeros, and recovers on its own after the
  power cycle.

### Address change

`modbus_address` stays "where the app talks". `settings["address"]` is where
the operator wants the module to *be*.

1. `configure!` writes register 200. The module keeps answering at the old
   address until power cycled.
2. After the power cycle the old address times out. The poller, on a failed
   device read, asks the driver `relocated_address(client)`. The WJ150 probes
   its product-ID register at `settings["address"]` and returns that address
   if it answers.
3. The poller commits `modbus_address` to the new value **and clears
   `settings["address"]`** (otherwise a later manual address correction would
   cause the driver to program the stale value again). The changed
   fingerprint rebuilds the driver at the new address.

The generic parts are `Base#relocated_address` (default `nil`) and the
poller's commit step; everything WJ150-specific stays in the driver.

## Frontend / API touch points (depend on the option above)

- `GET /drivers` already feeds the device form from `Registry.metadata`, so
  the driver, its inputs and `counts[n]` / `frequencies[n]` paths appear in
  the Devices tab and in logic-input binding pickers with no frontend change.
- `Device#inputs` / `io_labels` already allow naming the channels
  ("Primary loop flow") — that covers "use both channels independently".
- Settings UI (address, mode, pull-up, filter) is the part that needs new
  frontend work, and its shape follows the configuration mechanism.

## Implementation plan

1. Migration: `devices.settings` jsonb; add to `Device::CONFIGURATION_FIELDS`.
2. `Drivers::Base`: `settings_schema`, `normalize_settings`, `configuration_effects`,
   `relocated_address`. `Registry.metadata` exposes `settings` and uses the class method.
3. `Device`: validate/normalize `settings` through the driver; `DeviceApi`
   permits and serializes it.
4. `Poller::Connection` fingerprint includes settings; `Poller#poll_device`
   commits a relocation after a failed read.
5. `Drivers::WJ150` (read, device_support, catalogs, settings, configure!,
   relocated_address); register it.
6. Specs: driver (word order, mode guard, product-ID verdicts, configure!
   writes only on mismatch, relocation probe), device settings validation,
   poller relocation commit, catalog/metadata.
7. Frontend: `DriverFields.settings` / `DeviceFields.settings`; generic
   settings section in `DeviceEditor` (integer input or tri-state select,
   blank = unmanaged, power-cycle badge); drop blanks in `prepare`.
8. `claude/overview.md`; hardware verification on a non-production bus.
