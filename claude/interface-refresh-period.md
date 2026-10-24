# Interface Refresh Period

## Design

Add `update_period` in seconds to each `HostInterface`. It controls how often the poller reads the devices on that interface and applies pending output writes. The poller retains its one-second control loop so disabling a bus, handling scans, and noticing configuration changes remain prompt. A new or restarted poller polls an enabled interface immediately, then schedules its next hardware pass from the completion time; an edited period takes effect without reopening the serial connection. Avoid backfilling missed passes after a slow scan or read.

Persist a positive integer period with a 10-second database default for existing and new interfaces and model validation. Expose it through the existing host interface create, patch, and serialization paths and the interface editor/card. Permit changing the period while the bus is enabled; no hardware reconfiguration is required. This deployment branch uses the existing last-write-wins interface API.

Keep connection and device freshness honest for a long period. The interface heartbeat can remain on the one-second control loop; the dashboard's device-reading age threshold must scale with the interface period. Preserve the one-second loop's overrun logging as a measure of work per control cycle.

The period covers both device reads and output writes. Valid periods are 1–300 seconds. The dashboard treats a sample as stale after the larger of 35 seconds and three update periods.

## Implementation plan

1. Add failing RSpec model and request examples for the default, positive integer validation, and create/patch/serialized API field. Add poller examples using controlled time for independently scheduled interfaces, startup, editing the period, delayed cycles, and prompt disable/scan handling.
2. Add the column and model/API support. Implement per-interface due times in `Poller` while keeping its one-second control loop, held connections, and existing scan and release behavior.
3. Add the typed field, editor input, and displayed period. Add a focused frontend test for saving the field and for dashboard stale readings under a longer period.
4. Run focused RSpec and frontend tests, then the relevant broader checks. Update `claude/overview.md` with the resulting behavior and any operational caveat.

## Verification

Use fake Modbus clients in RSpec and frontend component tests. Do not start another poller or access production port 3001. A browser pass is optional if the component tests and build cover the editor.

## Implementation status

The migration, poller schedule, API, editor, and freshness display are implemented and deployed from `main` at `26f4dea`. On the main branch, 344 RSpec examples and 77 frontend tests pass; TypeScript typecheck and frontend build pass. The production migration is applied and all services are active with zero restarts. The running development poller must be restarted to load the new scheduling code.
