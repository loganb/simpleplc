# Temperature board product ID scan fix

## Design

The NT48C32 driver identifies the product by reading holding register 247. The board manual conflicts: its command overview lists 2532, while its detailed product-ID register table lists 2632. A real 32-channel board at address 2 reports 2608, which the manual associates with another NT48 model. The scan UX also initially omitted scalar values from single-register reads.

Use the explicit NT48C32 product IDs listed in the manual (2532 and 2632) as direct identification. Treat ID 2608 as a possible firmware misreport: for that ID, read the documented temperature bank (input registers 0–31) and resistance bank (32–63). Identify NT48C32-compatible hardware only when both banks read successfully, all temperatures have the documented pattern of signed tenths-of-a-degree readings or the 0xF555 no-probe sentinel, and at least one live temperature has a paired resistance above channel 20. This last condition distinguishes a larger model from NT48A08 and NT48B20 where sensors are connected. Unsupported banks mean no; transient or insufficient live-channel evidence means maybe. Keep scan evidence wire values as-is and render scalar values in the UI.

### Live register sweep at address 2

Read-only sweep on the disabled dev bus, using `SerialBusLock`:

- Holding register 247 returned 2608.
- Input registers 0–31 returned temperature-shaped values: channels 1–3 were 20.5, 20.5, and 20.4°C; channel 25 was 21.0°C; other channels returned 62805 (`0xF555`, the driver's no-probe sentinel).
- Input registers 32–63 returned resistance-shaped values: channels 1–3 were 12.21, 12.22, and 12.26 kΩ; channel 25 was 11.95 kΩ; most remaining channels returned 6553. The paired live sensor at channel 25 confirms operation above NT48B20's 20-channel range.
- Both function-code banks returned zeros outside their meaningful ranges through address 255, so simple register readability is not a useful discriminator. The meaningful 32-channel temperature and resistance layouts are the stronger identifier.
- This evidence matches the documented NT48C32 register map despite the conflicting product ID. N4DSC08 is a less plausible match: it is an 8-channel DS18B20 board and has no corresponding 32-channel NTC resistance bank.
- A final live call to `Drivers::NT48C32.device_support` read product ID 2608, 32 temperatures (channel 25 at 21.1°C), and 32 resistances (channel 25 at 11.90 kΩ), returning `yes` with the extended-channel reason.

## Implementation plan (written before implementation)

1. Add or update RSpec coverage for direct IDs 2532 and 2632, the observed 2608 plus both documented responding banks and realistic temperature values, unsupported banks, timeouts, and no live channel above 20.
2. Update `Drivers::NT48C32.device_support` to apply those rules while keeping all probe operations read-only. Do not treat arbitrary zero-filled readable ranges as proof of identity.
3. Keep the frontend scalar evidence formatter and its regression coverage from the previous implementation.
4. Run focused RSpec and frontend tests, then inspect the final diff.

## Implementation

Confirmed by the user: use the register fingerprint for the observed product ID 2608.

- `Drivers::NT48C32` accepts the manual's 2532 and 2632 values directly. For 2608 it reads both documented 32-register banks, verifies temperature shape, and requires a live paired channel above 20 before returning Yes; unsupported banks return No, while transient or insufficient live-channel evidence returns Maybe.
- The frontend probe-evidence type and formatter display scalar values as well as arrays. Scan fixtures and the stale product-ID note in `claude/host-port-scan.md` were updated.
- Verification: `bundle exec rspec spec/services/hardware_scan_spec.rb` (16 examples, 0 failures); focused Vitest coverage for `hardware.test.ts` and `HardwareSetup.test.tsx` (27 tests passed); `npx tsc --noEmit` passed; `git diff --check` passed. The updated read-only driver probe also returned `yes` on the live address-2 device.
