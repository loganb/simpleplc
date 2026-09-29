# Hardware setup

## Scope and design discussed

User requested production configuration cleanup matching the observed hardware, using only the HTTP API exposed to the UX. Record API/UX deficiencies; feature design and implementation come later. User selected task name `hardware-setup`.

## Operational plan and implementation boundary

The operational sequence was stated before mutations: inspect dependencies, disable the interface, remove absent temperature devices, move the existing relay record to address 1, replace the missing port with the discovered stable FTDI path, enable and verify polling. This is configuration work; no application code changed.

The user approved implementation with “Okay, let’s go” on 2026-09-26. Implementation follows the plan below using RSpec red-green refactoring.

## Completed configuration — 2026-09-26

All production reads and writes used GET/PATCH/DELETE on the public Rails resources at port 3001. No database access, Rails runner, service controls, or direct serial access was used in this cleanup.

- GET measurements, output_blocks, and logic_diagrams returned empty queries before deletion.
- PATCH host_interfaces/1 disabled the interface; GET confirmed disabled.
- DELETE devices/1 and devices/2 removed the absent DS18B20 and NTC temperature-board configurations; both returned 204.
- PATCH devices/3 preserved the relay record, set Modbus address 1, and retained Drivers::N4D8B08.
- PATCH host_interfaces/1 set name `RS-485 Relay Bus`, port `/dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_D30I8SGW-if00-port0`, and 9600 baud, 8 data bits, no parity, 1 stop bit.
- PATCH host_interfaces/1 re-enabled polling.
- GET devices verified two distinct successful polling timestamps, ending at 2026-09-26T17:47:19Z: status ok, error null, no output write errors, eight false inputs and eight false outputs. Interface online with no connection error. GET host_ports confirmed adapter claimed by interface 1; console UART unclaimed.
- Device identification remains based on register compatibility rather than a unique product ID. Normal poller initialization of this driver writes the unrelated input/output relationship mode. No output blocks or control diagrams exist.

## API/UX deficiencies for later design

### Encountered directly through the API

1. **No bus/device discovery API.** host_ports enumerates adapters only. The previous direct serial scan supplied address and driver evidence; this API-only cleanup could only configure that evidence and verify normal polling. Need a discovery workflow with poller coordination, progress/cancel, results, identification confidence, and adoption of results. Exact design remains open.
2. **Repair exposes stale connection errors.** Immediately after selecting the present FTDI port, the response still reported the old missing macOS path in connection_error, alongside port_present true. It cleared on the next poller report. Accepted as a brief display inconsistency; no special report-version machinery or stale-error fix is planned.
3. **Reconciliation takes separate mutations.** Removing the record at address 1 had to precede moving the relay to address 1 because bus/address is unique. Disabling the interface made this manageable. No staged reconciliation/atomic apply endpoint exists; whether one is needed is a design question.
4. **Dependency inspection is manual.** Queried measurements/output_blocks/logic_diagrams before deleting absent devices. There is no consolidated impact preview in this workflow.

### Confirmed by source inspection, not browser interaction or destructive probes

5. **Port replacement UX is missing.** DevicesTab.usePort always opens a new interface. Existing-interface editing provides a free-text port field; the missing-port warning says to pick from the scan but that action creates a new record rather than repairing the existing one.
6. **Delete UX does not await success.** DeviceForm and HostInterfaceForm call destroy, immediately refresh and close, with no confirmation or local error presentation. Interface deletion cascades to devices. Failure and dependency impact need explicit treatment.
7. **Save/toggle errors are weak.** Both forms display only `Save failed`; HostInterfaceCard handles toggle success without presenting failure. Validation/conflict errors should be actionable.
8. **Stale form writes are not protected by the exposed version.** Responses contain lock_version, but these forms/store do not submit it and DeviceApi/HostInterfaceApi strong parameters do not accept it. Server optimistic locking detects races during a request, not an operator saving a stale form. Previous overview wording about request-time conflicts should not be read as end-to-end stale-editor protection.
9. **Driver selection is technical and unvalidated as a supported type.** DeviceForm hardcodes Ruby class names; Device validates driver presence, then constantizes it at polling time. No driver metadata/discovery endpoint or supported-driver allowlist is present. Need friendly names/capabilities and explicit distinction between inferred identity and verified compatibility.
10. **Adapter ownership is not enforced by the model.** HostInterface validates port presence but not uniqueness of the resolved physical adapter; scan reports one claimant and the UI hides Use This Port for claimed adapters, but manual/API entries can alias the same adapter. Not tested by creating a duplicate on production.

## Follow-up

Design and prioritize with the user before implementation. These findings are observations and candidate requirements, not an approved feature plan. No application code or tests changed during configuration cleanup.


# Proposed implementation plan: complete hardware setup from the UX

Status: deployed to production as 894cdcf on 2026-09-26 after user approval.

## Outcome and scope

An operator can discover adapters, create or repair a bus, discover responding devices, review device identity, reconcile configuration, inspect deletion impact, verify reads, and resume operation entirely in the Devices tab. Every step has a documented HTTP API and recoverable status. No shell command, service restart, database edit, or copied serial path is required for the supported workflow.

Initial support covers the three existing drivers, Modbus RTU addresses 1–247, and operator-selected serial settings. Default scans use the bus settings (9600 8N1 for a new bus). An advanced scan can try an explicitly selected, bounded set of serial profiles and records which profile produced each response. It must not silently combine devices requiring incompatible settings into one operating bus.

This configures the application to match connected hardware. Changing physical device addresses/baud rates, firmware updates, adding unsupported drivers, and manually actuating outputs are separate features. Duplicate devices sharing an address cannot be reliably enumerated by Modbus; the UX must describe ambiguous/corrupt responses and suggest isolating boards rather than invent an identity. Normal operation retains the existing device configuration behavior through an explicit configure! call, rather than constructor IO.

## Agreed revisions

- Store the current scan request, state and JSON results on HostInterface. No separate setup-session or scan records, queued scan history, or persistent verification jobs.
- Scan only a disabled interface. Disabled means ordinary polling/output writes are disabled; an explicitly requested scan may still open the port.
- The existing poller performs the whole scan synchronously. Other interfaces wait until it finishes. This is an accepted tradeoff; per-interface threading is future work, not part of this implementation.
- Keep bounded serial timeouts and cancellation checks between addresses/transactions. These do not require incremental scheduling.
- Keep existing connection-error behavior: errors from a previous configuration clear on the next poll. Do not add report fingerprints or revision-based connection-status machinery solely to eliminate this brief inconsistency.
- Driver constructors perform no hardware IO. Move device configuration writes into an explicit configure! method called by the poller during normal connection preparation, never by discovery.
- Each registered driver provides a read-only device_support check returning yes/no/maybe with reasons. Scan results list every driver and let the operator select the correct one.
- Configuration revisions still protect against stale operator edits; this is separate from stale connection-error display.

## Operator workflow

1. Discover serial ports in Devices. Show friendly labels, adapter identity, claims, and kernel-console warnings. Create a bus or use Replace Port on an existing bus. New buses start disabled; manual entry remains available for unattached hardware.
2. Disable the selected interface and request a scan. Explain that disabling stops ordinary polling/output writes, not the physical relay state. The poller finishes its current work and closes the normal connection before scanning. No separate Enter Setup action or session is needed.
3. Scan the selected address range and serial profile(s). Show requested/scanning status, progress, elapsed time, partial results, cancellation and retry. Explain that other interfaces' polling is delayed during the scan, so their readings and heartbeats can become stale. Do not introduce a scheduler or synthetic heartbeats to hide that tradeoff.
4. Review results alongside configured devices. Choose Add, Match Existing, Update Existing, or Ignore. Keep unmatched configured devices unless explicitly removed. List every registered driver with Yes/No/Maybe support and its reason, let the operator select the correct driver, and preserve existing record IDs where appropriate.
5. Preview configuration changes and dependency impact, then Apply. The bus remains disabled. Reject stale previews with actionable errors rather than overwriting newer edits.
6. If needed, run another read-only scan at the final settings/range to check selected driver compatibility. This uses the same scan state and replaces the previous attempt; no separate verification resource is needed. Results retain their actual settings/time and must not be presented as verification of subsequently changed settings.
7. Enable the interface explicitly when ready. Show affected output assignments and explicit driver configuration effects. Verify two fresh successful ordinary polling cycles in the UX; old readings or an old online flag do not count. The operator may instead leave the bus disabled and return later.

Completion, failure, cancellation, navigation away, and poller restart never auto-enable a disabled bus. Cancel Scan and Enable remain distinct actions. All progress and results are retrieved from HostInterface after refresh/reconnect.

## HostInterface scan state and execution

Add the following persisted fields to HostInterface (exact column names can follow repository conventions):

- scan_state: idle, requested, scanning, completed, failed, cancelled, or interrupted.
- scan_request_id: token identifying the current attempt and making a retried request idempotent.
- scan_options: JSON snapshot of address range, serial settings/profile list, adapter identity/path and probe version.
- scan_results: JSON with schema version, progress, responders, identification evidence, diagnostics and operation error. Partial results survive a failed/cancelled attempt.
- scan_requested_at, scan_started_at, scan_finished_at, and scan_updated_at.
- scan_cancel_requested: operator request checked by the poller; the poller owns final completion/cancellation status.

Only one current attempt exists per interface. New requests replace terminal results; the UX makes that explicit. The API permits request/cancel commands, not arbitrary client writes to poller-owned status/results. A duplicate request with the same token returns the existing attempt; another request while pending/running returns 409. A cancellation includes the attempt token so an old client cannot cancel a newer attempt.

Legal transitions: idle/terminal → requested → scanning → completed/failed/cancelled/interrupted. Cancelling a requested attempt can immediately make it cancelled. Cancelling a running attempt sets scan_cancel_requested and reaches cancelled after the current bounded serial transaction finishes. State updates compare the current attempt token so delayed writes cannot overwrite newer results.

The poller checks disabled interfaces for requested scans instead of simply skipping them. It finishes any existing ordinary work, releases the normal connection and cached drivers, claims the request atomically, then calls a dedicated scanner service to run the entire sweep before continuing to the next interface. Reload disabled/request state before claiming; do not act on the interface snapshot loaded at cycle start. No serial IO occurs in controllers, and no database transaction spans the sweep.

The scanner uses read-only probes, bounded serial retries/timeouts, and cancellation/shutdown checks between addresses and transactions. Persist progress periodically and on terminal transitions, without yielding normal polling to other interfaces. Limit address/profile counts and total operation duration. Test bounded cancellation latency against the maximum transaction timeout. Keep the service isolated so eventual per-interface threads can invoke it without redesigning the scan protocol; do not implement threading now.

Enabling, changing port/serial settings, applying configuration, and deleting/moving scan-related configuration are rejected while a scan is requested/running, including while cancellation is pending. Cancel and wait first. Serialize those checks with request claiming. Finishing a scan always leaves enabled false.

Use a shared OS-level advisory lock for every serial open, held until close by normal polling and scanning. Key it to the resolved physical device, not its alias, and use a common lock directory across development and production. Revalidate identity after acquiring it. This coordinates participating application processes, not arbitrary external serial tools. Return an explicit busy error instead of waiting indefinitely.

On poller restart, mark a previously running attempt interrupted rather than silently replaying it; a merely requested attempt may still start. Establish that the previous worker no longer owns the attempt/physical lock before marking it interrupted: a stale heartbeat alone is not proof, especially with synchronous scans. Release connections and locks in ensure paths. Partial results remain available and the operator can retry or repair the port. Missing hardware fails the attempt without enabling the interface.

## Read-only discovery and driver registry

Introduce a registry mapping allowed driver keys to classes, friendly names, channels, readable fields, binary-output capabilities, configure! effects, and read-only probe definitions. Keep existing stored class strings compatible through explicit mapping; stop arbitrary constantization of operator input. Device and output validation both use this registry. Expose it as a read-only Driver resource consumed by forms.

Discovery and verification use read-only probes and never call configure!. Driver construction itself is safe and performs no hardware IO; probes may reuse side-effect-free driver construction/read logic where appropriate. Validate register/function choices against the manuals in doc/hardware before implementation. Use documented read functions only; test that no write function is emitted, including during scan/open and failure handling.

First establish a valid responder (including a valid Modbus exception), then evaluate driver compatibility. Check response address, framing and CRC through the transport; noise/CRC failures are diagnostics, not discovered devices. Do not stop at a register-zero timeout: some boards require a documented alternative read probe. Unknown responders remain visible without an assigned driver.

### Per-driver compatibility contract

Each registered driver implements a class-level device_support(probe) method. A class method works before a Device record exists; the supplied probe context is bound to the discovered address and serial settings and exposes only bounded read operations. Use device_support rather than device_supported? because Ruby predicate names normally imply a boolean. The registry supplies stable driver keys and friendly labels.

Return a structured result with support (:yes, :no, or :maybe), a human-readable reason, and supporting read evidence/diagnostics. Serialize the status as yes/no/maybe strings. Drivers::Base defaults to maybe with a reason that no compatibility test is implemented; each of the three supported drivers must implement its own check.

- **Yes:** documented identification or sufficient driver-specific evidence establishes compatibility. This means the driver supports the observed device, not necessarily that the exact product identity is known.
- **No:** positive evidence establishes incompatibility, such as a conflicting known product ID or a required function/register demonstrably unsupported. Do not treat an arbitrary missing optional register as incompatibility.
- **Maybe:** evidence is ambiguous, incomplete, unavailable, or a check has not been implemented. A timeout or CRC error alone is not No. Plausible register shapes without distinguishing evidence stay Maybe.

Validate each driver's rules against doc/hardware. NT48C32's product ID can provide strong evidence. The relay and DS18B20 boards may remain Maybe where register reads cannot distinguish models. Each driver owns its rules; do not put a growing driver-name case statement in the scanner.

For every responding address/profile, call every registered driver's check and persist a driver_support list in scan_results, including driver key, support, reason and evidence. Do not stop at the first Yes: more than one driver can be compatible. A read-only probe context may cache identical reads within this address/profile attempt to avoid redundant traffic. Bound per-driver probing and check cancellation between reads. Isolate a driver-specific check failure as Maybe with diagnostics and continue other checks; a lost serial connection fails the scan while retaining partial results. Mark unevaluated checks as Maybe with an explicit incomplete/cancelled reason rather than fabricating a compatibility verdict.

Neither device_support nor the probe context may call configure! or issue writes. Constructor IO remains forbidden. Persist scan settings, probe version and observation time alongside results so older evidence is identifiable after configuration changes.

### Driver selection in the UX

Each discovered device shows all registered drivers, friendly names, Yes/No/Maybe badges and reasons. Put Yes choices first, then Maybe; show No choices as incompatible. The operator selects the driver before Add/Match/Update is applied; scanning itself never creates records, selects a driver permanently, or configures hardware. Multiple Yes choices and all-Maybe results are valid outcomes, not scan errors.

Allow selection of Yes and Maybe drivers; explain uncertainty for Maybe without requiring an extra approval dialog. No choices remain visible but are disabled in the scan-adoption flow. Mirror that restriction server-side when applying a choice tied to the current scan result, and reject stale attempt tokens. Existing manual setup remains available for devices without scan evidence; absence of evidence is not a claim of incompatibility. A new scan replaces old evidence rather than permanently blacklisting a driver.

Carry the selected registry key into the existing device driver field through the registry mapping. Changing the choice must revalidate affected channel/source dependencies in preview/apply. Allow leaving a responder unconfigured. After enabling, normal polling verifies the selected driver's actual read behavior; a Maybe choice must not be relabeled Yes just because the operator chose it.

## Explicit driver configuration lifecycle

Add a no-op configure! method to Drivers::Base for drivers without setup writes. Move the N4D8B08 relationship-register write out of initialize and into its configure! implementation. Constructors only bind their device/slave and initialize local state; they perform neither serial reads nor writes.

During normal enabled polling, Poller::Connection constructs a driver, explicitly calls configure!, and caches it only after configuration succeeds. Configure once per successfully prepared driver on a connection, not on every poll. A reconnect or a change to driver/address discards the cached instance and configures the replacement before normal reads or output writes. Clearing drivers for a scan likewise requires configuration when normal operation resumes.

If configure! raises, do not cache the driver or continue with its read/output commands. Report the failure through the existing poller error path, closing the connection for serial-level errors as today. Retry on a later normal poll; configuration must be safe to repeat if a write succeeded but its acknowledgement was lost. The relay configuration writes an absolute relationship mode, not a toggle. Persistence retries must never repeat hardware IO within the same attempt.

Scanning and read-only verification never invoke configure!, directly or indirectly. No new configuration API/button is needed: enabling normal polling triggers the explicit lifecycle. Update driver/poller comments and existing tests that currently describe constructor writes.

## Configuration integrity and revisions

Add a configuration revision to hardware records, separate from lock_version. Poller observations continue advancing lock_version for storage/stream ordering but never advance the configuration revision. Host-interface and device edits, creates/deletes within a bus, and reconciliation application advance the appropriate bus revision. Require the revision captured when an edit form opens, not the latest live-store revision at submit. Keep draft fields intact as live observations arrive.

Check expected revisions and apply edits within row-locked transactions. Return a structured 409 with current configuration and conflicting fields on stale edits. Observation-only updates must not produce false stale-form failures; use locked latest rows or bounded observation-race retries without overwriting new operator edits. Apply the same precondition policy to deletes, toggles, and configuration application. Scan progress/results do not advance configuration revisions; scan commands use the attempt token and lifecycle checks. Update all affected clients together; omitted required preconditions must receive a clear client error.

Enforce one configured owner per adapter: canonicalize discovered aliases to a stable identity server-side, maintain a database-unique claim, and reject a second owner even through a different path. Manual missing paths are allowed as unresolved configuration, but must resolve and acquire a unique physical claim before opening. Recheck ownership on replug/open. Do not use File.realpath-only validation as the concurrency guarantee.

Add a database uniqueness constraint for (host_interface_id, modbus_address), after a migration preflight reports existing duplicates rather than deleting data. Reconciliation validates the entire intended final device set, not each row against an intermediate set. Support address swaps with a transactionally deferred unique constraint and final-set validation; preserve callbacks and normal version increments. Do not temporarily set invalid addresses or bypass observers with bulk SQL. Existing one-record edits retain ordinary uniqueness checks.

Structural edits (port, serial settings, driver, address, deletion/moves) require a disabled bus, released normal connection, and no requested/running scan. Enforce the same checks through ordinary CRUD and reconciliation commands. A stale heartbeat alone does not prove release; the poller must acknowledge it or ownership must be established through the physical lock. This ownership check is separate from the deferred cosmetic stale-error issue. Renaming can remain available with revision protection. Cross-bus moves require both buses quiescent and checked revisions; the first reconciliation screen handles one bus at a time.

## Preview, apply, dependency impact and deletion

Provide a host-interface configuration preview endpoint accepting the proposed final changes and expected revisions. Return additions/edits/removals, address conflicts, driver incompatibilities, affected measurements/output blocks/diagrams, and remaining verification steps. A scan timeout never automatically deletes a device.

Apply revalidates the preview under transaction locks and writes the complete set atomically. Return normal flat serialized records, deleted IDs, updated revisions and query invalidation hints. Clients refresh affected queries explicitly; existing record-update streaming does not discover additions/deletions. A network retry with the same idempotency key returns the already committed result.

Add an impact resource for individual device/interface deletions. Default to blocking deletion when measurements or outputs reference a device, with links and clear remediation steps. The UX can reassign compatible references or explicitly edit/delete dependencies through their existing screens; do not silently remove diagrams or detach acquisition sources. Interface impact includes its devices and all their references. Recheck dependencies at deletion time; preview is advisory, not permission to use an old dependency list. Preserve database foreign keys and serialize competing reference changes with deletion, mapping remaining integrity races to actionable responses.

Changing a driver's capabilities must also validate existing channel and measurement source references. Preserve references only when compatible; block and explain incompatible changes. Setup does not rewrite control logic expressions automatically.

## API and status contract

Retain RestfulApi flat payloads and the HostInterface resource. Proposed routes:

- GET /drivers; existing GET /host_ports remains read-only.
- POST /host_interfaces/:id/scan to request a scan while disabled, with options and request token.
- POST /host_interfaces/:id/cancel_scan with the current request token.
- Existing GET /host_interfaces and /host_interfaces/:id expose scan fields and JSON results.
- POST /host_interfaces/:id/preview and /apply for reviewed configuration reconciliation.
- Existing PATCH /host_interfaces/:id with enabled false/true disables/enables normal operation; no setup-session, resume or finish endpoints.
- GET /devices/:id/impact and /host_interfaces/:id/impact.
- Existing hardware PATCH/DELETE endpoints gain consistent revision and lifecycle checks.

HostInterface already participates in record streaming. Publish scan progress through those updates, with bounded HTTP refresh while a scan is active and after reconnect as fallback. A successful request response means queued/requested, not completed. The operation survives browser navigation. Keep JSON payloads bounded by the scan limits and throttle progress updates.

Standardize errors with a machine code, human message, field errors and related records where useful. Use 422 for invalid configuration, 409 for stale configuration/ownership/lifecycle/dependency conflicts, 404 for missing resources, and persisted scan failure states for serial errors. A request with an unavailable poller remains requested with clear UX status and can be cancelled. Map expected validation/foreign-key failures explicitly instead of returning an opaque server error.

Keep existing connection errors clearing on the next normal poll; no special configuration fingerprint/report version is introduced for that display issue. Show scan state separately from normal connection health: disabled interfaces may be scanning, and other buses may have stale observations while a synchronous scan blocks the poller. Never equate a stale heartbeat with proof that a port is free. Confirm post-enable success using fresh device polling timestamps and successful data reads.

## UX changes outside the setup flow

- Existing interface gets Replace Port, with the discovered-port picker preselecting its claim and preserving its ID/devices. The generic Use This Port action offers create versus repair where applicable.
- Driver selection uses registry labels and capability descriptions; interface selection uses names with paths as secondary text.
- Save/delete/toggle actions retain drafts, disable duplicate submissions, await completion and display structured errors. Delete confirmation includes dependency impact. Failed deletes leave the record visible.
- Conflicts offer reload/review while retaining the user's proposed values, not blind automatic retry. Successful deletion invalidates all relevant queries and caches.
- Show Disabled plus the current scan state, with Cancel Scan and Enable as distinct actions. Keep scan results visible after completion and page reload.
- Verification displays fresh inputs/outputs/temperatures and read errors, with observation age; stale old values must not look like successful verification.

## Implementation sequence — RSpec red-green for each slice

1. **Foundations:** first add failing driver/poller specs for IO-free constructors, explicit configure!, configuration-before-read, once-per-connection caching, reconfiguration after reconnect/identity change, and failure without caching or output writes. Implement the configure! refactor. Then add failing request/model examples for driver allowlisting, metadata, structured errors, stale-edit protection without heartbeat conflicts, and dependency-safe deletion. Implement registry/configuration revisions and transaction semantics; migrations preflight existing data. Add targeted frontend tests for preconditions, retained drafts and error propagation.
2. **Port repair and ownership:** failing specs for alias collisions, concurrent claims, missing ports, replacement preserving IDs/references and safe release checks. Implement claims, physical lock and Replace Port UX. Test lock contention with subprocesses as well as fakes. Do not add cosmetic connection-report versioning.
3. **HostInterface scan state machine:** failing model/request/poller specs for disabled-only requests, atomic claiming, attempt-token retries, cancellation, rejection of enable/edit/delete during pending/running scans, unavailable poller, and restart interruption. Add scan columns and wire a dedicated synchronous scanner service into the existing poller. No session/job models, scheduler, or threads.
4. **Read-only discovery:** add per-driver device_support specs for Yes/No/Maybe, reasons/evidence, ambiguous layouts, conflicting IDs, timeouts, malformed replies and no writes/configure!. Verify every registered driver is evaluated for each responder, multiple compatible drivers are retained, check failures remain Maybe, and results survive JSON round trips. Then add failing probe/service specs for the three drivers, unknown responders, valid exceptions, bad frames, timeout fallbacks, bounded options, partial results, cancellation, unplug and shutdown. Assert no serial writes or configure! calls; separately verify all constructors perform no hardware IO. Verify that another interface waits for the sweep to finish and then polling continues; fairness during the sweep is not a requirement.
5. **Reconciliation:** failing request/service specs for add/match/update/remove, address swaps, preserved IDs, full rollback, stale previews, new dependencies, duplicate apply and incompatible references. Implement interface-scoped preview/apply and impact endpoints, using the disabled/no-active-scan checks.
6. **Complete UX:** implement discover → disable → scan → review → apply → optional rescan → enable → verify normal polls. Add focused component/browser tests for delete failures, field errors, stale drafts, multi-tab conflicts, refresh/reconnect, progress, cancellation and retained results. Test all driver verdicts and reasons, selection among multiple Yes/Maybe choices, disabled No choices, explicit choice before apply, stale scan tokens, and leaving an unknown responder unconfigured. Explain delays to other interfaces during scanning. Reuse current store/URL conventions.
7. **Integrated validation:** run relevant RSpec examples then full backend suite, frontend tests, typecheck and production build. Exercise an API-to-poller-to-UX journey using a fake Modbus endpoint or PTY simulator. Review migration/rollback compatibility, update overview/API notes, and demonstrate the workflow before production deployment is requested.

## Acceptance scenarios

- Reproduce the real cleanup from a fixture: obsolete macOS port, absent temperature records at 1/2, relay configured at 3 but responding at 1. Repair, scan, explicitly remove/match, apply and enable entirely from UX; relay record ID survives and two fresh normal polls succeed.
- A new adapter and supported board can be configured from an empty database through friendly choices. Unknown responders remain visible and unconfigured. No response at tested settings does not imply no device at every baud rate.
- Every discovered responder lists all registered drivers with Yes/No/Maybe and reasons. The operator can choose a compatible or uncertain driver before applying; the API validates the scan-based selection. Timeouts are not mislabeled as incompatibility, and choosing a driver does not change its evidence verdict.
- Port replacement preserves references; aliases cannot create two owners. A competing development poller cannot transact concurrently.
- Driver constructors perform no serial IO. Normal polling calls configure! before first use, caches only successful configuration, and reconfigures after reconnect/identity changes. Failed configuration prevents reads/output commands for that attempt. Discovery never calls configure!.
- A disabled interface can execute an explicitly requested scan. Every scan emits reads only. Other interfaces wait during the sweep and resume afterward. No incremental scheduler or per-interface threading is required.
- Completion/cancellation/failure/restart never auto-enables the scanned interface. Scan state and results survive navigation. Enabling or changing scan settings while pending/running returns a clear conflict; cancellation allows recovery.
- Two operators cannot overwrite configuration. Poll observations and scan progress do not invalidate edit forms. A delayed scan write cannot overwrite a newer attempt.
- Destructive actions show impact and await success. New dependencies invalidate stale previews. Reconciliation commits the full valid change or none of it.
- The old connection-error text may remain until the next poll; that is accepted. Fresh normal device readings establish post-enable verification, without new connection-report revision machinery.

## Decisions and approval

Agreed revisions: HostInterface owns a single scan state machine and JSON results; scanning requires disabled normal operation; the poller performs the full scan synchronously; other interfaces wait; per-interface threading is future work. Move constructor hardware writes into explicit configure! during normal poller preparation. Each driver supplies a read-only device_support verdict (yes/no/maybe); the UX displays all verdicts and lets the operator choose the driver. Remove separate setup/scan resources, incremental scheduling, and the cosmetic stale-error fix from this plan.

Retained proposals: read-only driver probes, reviewed atomic reconciliation, configuration-specific revisions for stale edits, adapter ownership enforcement, and dependency-aware deletion. Physical device address/baud programming and manual output actuation remain outside scope.

The user has confirmed the revised implementation plan; implementation is authorized. Review the hardware manuals when implementing probe details without broadening discovery into device writes.


## Implementation results — 2026-09-26

Implemented the approved workflow in the development checkout. Production remains on the previously deployed commit and configuration.

- Driver constructors are IO-free. Base.configure! is a no-op; N4D8B08.configure! sets the relationship register. Poller::Connection calls it before caching, retries failed configuration on a later poll, and configures again after reconnect/identity changes.
- Drivers::Registry defines the supported drivers and friendly metadata. Every driver supplies device_support with yes/no/maybe and evidence. Drivers::Probe exposes read operations only and caches reads within an address/profile attempt. The NTC product ID gives Yes/No; ambiguous relay/DS18B20 layouts remain Maybe. Scans never configure devices.
- HostInterface owns scan state, request token, options, JSON results, cancellation and timestamps. HardwareScan executes a complete synchronous sweep for a disabled interface; other interfaces wait. Limits: addresses 1–247, up to four serial profiles, 200 ms serial timeout with one attempt, 900 seconds total, cancellation/shutdown checks between transactions. A failed/cancelled scan retains partial evidence.
- A PostgreSQL advisory lock identifies the live scan executor; abandoned running scans become interrupted. SerialBusLock uses a shared per-user physical-device lock for normal polling and scans. Adapter claims are rechecked before opening, including when a previously absent adapter appears.
- Configuration revisions are separate from observation lock versions. Hardware edit/delete requests require an expected revision. Ordinary polling and scan progress do not invalidate drafts. New API-created interfaces start disabled.
- Added driver metadata, scan/cancel, dependency impact, preview and apply endpoints. Reconciliation preserves matched record IDs, validates the final address set, supports swaps using a deferred database constraint, and commits atomically. The latest apply token/result makes a lost-response retry idempotent. Referenced device deletion and incompatible driver changes are blocked with structured errors.
- Reference writes lock the referenced device and recheck compatibility, serializing them with device reconfiguration/deletion. Database foreign keys remain intact.
- Devices UX includes existing-interface port replacement, friendly manual driver selection, scan progress/cancel, all per-driver verdicts, explicit adoption into a draft, matching existing devices, explicit removal, preview/apply, dependency links, reviewed enable, and two-fresh-poll verification. Save/delete errors retain the form and draft. Conflict recovery compares the current record before the user chooses how to proceed.
- The Devices tab refreshes interface/device queries every three seconds as a fallback to live updates. Port rescanning is forced once per request rather than repeatedly on every store notification. Old observation timestamps are shown as stale. Briefly old connection errors still clear naturally on the next poll.

### Validation

- 181 RSpec examples pass, including a complete API → poller → fake RTU endpoint journey that reproduces the obsolete-port/temperature-record/relay-address cleanup, proves zero scan writes, preserves the relay ID, and observes configure! exactly once during normal polling.
- Ownership tests include a second process contending through a filesystem alias, plus a previously missing adapter appearing with an existing claim.
- 33 frontend tests pass, including actual Preact component tests under jsdom for explicit driver choice, disabled No choices, stale-draft preservation, failed deletion, and fresh-poll verification.
- TypeScript checking and production frontend build pass. Ruby style corrections were applied to the changed implementation files; whitespace checks passed.
- Test and development databases migrated. Migration preflight refuses duplicate device addresses or resolvable adapter claims instead of deleting or arbitrarily choosing records.
- A Chromium smoke attempt produced no usable result and was terminated by its 15-second timeout. Its isolated test web server also exited on a timeout; no test/browser processes remained. Component rendering is tested under jsdom, but real-browser rendering has not been visually verified. No tests opened the production serial bus.

### Running and deployment

Start/restart the development API and poller to load the migrated schema and new code, and run the frontend dev process. Use Devices → disable a bus → scan → select/match drivers → preview/apply → review and enable. Physical address/baud programming and manual output actuation remain outside this scope.

No commit or production deployment was performed for this implementation. A future deployment must install the new code and migration together and restart both web and poller; old clients lacking configuration_revision receive an actionable precondition error and should reload.


## Production deployment — 2026-09-26

User authorized commit, push, and deployment. Implementation commit 894cdcf was pushed to origin/main and deployed with bin/deploy. Production migration and frontend build succeeded; web and poller are active. Homepage, health, driver metadata and device API returned 200. Relay device 3 at address 1 resumed successful polling with all eight inputs and outputs false, no errors, and the interface online. Real-browser visual verification remains outstanding.

## Simplified — 2026-09-29 (`store-io-cleanup` phase 2)

Parts of the design above are superseded; see `claude/store-io-cleanup.md`.

- **Scan:** no `scan`/`cancel_scan` endpoints. Clients PATCH the HostInterface
  `scan_state` to `requested` (with `scan_options`) or `cancelling`. A
  `cancelling` state replaces `scan_cancel_requested`. The server generates
  `scan_request_id`; the client-token idempotency and token-scoped cancel are gone.
- **Reconciliation removed:** no `preview`/`apply`, no `last_apply`, no
  `validate_scan_choice!`, no deferred address swaps. Scan results become
  devices through ordinary Device create/patch; an address swap is
  delete-then-move.
- **Impact:** no impact endpoints; the UI computes dependencies from the
  Measurement/OutputBlock records it already loads. `deletable!` still blocks
  deleting referenced devices server-side.
- **DELETE** no longer takes `configuration_revision`; `quiet!` and
  `deletable!` remain the guards. Update revisions and `compatible!` are unchanged.

