# Pulse Counter Dashboard UX

## Design

Task name: `pulse-counter-dashboard-ux`.

The WJ150 driver already returns two `counts` and two `frequencies` in matching
array positions. In the shared device state card, render these as two channel
rows using the temperature probe row style. Show `Ch 1` and `Ch 2`, each with
its raw pulse count followed by the paired frequency in parentheses, for
example `123 (4.5 Hz)`. Preserve zero readings. The same card appears on the
Dashboard and Devices tabs, so one frontend change covers both. Keep the
existing stale, status, error, and polling time presentation. No API or driver
change is needed.

An alternative is a generic renderer driven by the driver's input catalog.
That would add catalog lookup and formatting rules to every device card for a
single known data shape. A focused pulse-counter branch beside the existing
temperature branch is simpler here.

## Implementation plan (written before code changes)

1. Add a frontend component test with paired count/frequency readings for both
   channels, including a zero reading. Verify it fails while the card shows JSON.
2. Add a pulse-counter branch in `DeviceData` to render two rows and their
   values as `count (frequency Hz)`; preserve the existing temperature and relay
   renderers.
3. Run the focused frontend test, TypeScript check, and build. Run the existing
   WJ150 RSpec examples to verify the backend data contract.
4. Update `claude/overview.md` with the completed UI behavior and verification.

## Status

Implemented the shared device-card renderer after the test failed against the
JSON fallback. The focused frontend test, WJ150 RSpec examples, TypeScript
check, and frontend build verify the result.
