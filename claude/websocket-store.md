# WebSocket store — proposed architecture

Status: revised scope from user; no implementation started. The lock-version prerequisite is complete (claude/lock-version.md); runtime writes now use Active Record callbacks and all seven application tables carry lock_version. Focus subsequent design on updates to already-known records. Query invalidation/recomputation and discovery of new objects are deferred. The broader proposal below is historical context, not the current implementation scope; database triggers/outbox are superseded as the recommended next step by callback-enabled application writes.

## Goal and review of the sketch

Deliver committed server changes to the UX without manual refresh, including poller writes, creates/deletes, query membership, and computed API fields. Preserve the store's synchronous cached reads and existing useLoaders integration.

The proposed direction is sound, but transport, interest filtering, change capture, and cache coherence are separate concerns. Recommend an invalidation WebSocket with HTTP reads/writes first, then optional request transport migration. Recommend broad model interest first, exact IDs second, Bloom filtering only after measurement.

Repository findings:
- RestfulModelStore uses Axios for CRUD/queries and a two-generation cache. Reads promote previous-generation entries. App loads six whole model collections regardless of active tab and forces refresh every five minutes.
- soil() batches change events; useLoaders reruns loaders and gates repaint on observed _seq values. Invalidation must lead to new relevant sequences, including empty query results.
- query_version already tracks local query invalidation. update_store accepts older responses unconditionally; its optional lock_version check only suppresses repaint, and incorrectly treats zero as absent.
- No database models have lock_version columns. Poller device updates and HostInterface reports use update_columns; shutdown uses update_all. after_commit callbacks alone miss these writes.
- Measurement/LogicBlock/OutputBlock expose results from the latest Trace. OutputBlock also depends on LogicDiagram.output_enable. These representations can change without their own rows changing.
- HostInterface.connection_state expires with time; port presence and HostPort data come from filesystem reads. Database notifications cannot cover these alone.
- Existing invalidates hashes use Ruby class keys while frontend lookup expects singular model names; normalize and test this wire contract.
- Development Cable uses process-local async; production uses Solid Cable. There are no application channels. Poller is a separate process.

## Proposed design

### Transport and API boundary

One Action Cable subscription per store/browser tab. Use explicit protocol version and resource registry (device, host_interface, logic_block, etc.; STI maps to logic_block). Validate resource/action names and bound message sizes. Apply API-equivalent access rules before transmitting any IDs; interest filters are not authorization.

Initial version retains HTTP CRUD/query envelopes and adds asynchronous invalidations. Configure Solid Cable for cross-process delivery in development as well as production, mount/verify /cable, and configure dev origin and production URL handling.

Later, extract controller orchestration/serialization into a transport-independent dispatcher with request-scoped API context. Both HTTP and Cable invoke it. Socket requests carry request_id, operation, resource, IDs/query/attributes; responses carry request_id, status and the existing flat data envelope. Unsolicited changes are a distinct message kind. Correlation IDs do not guarantee mutation idempotency: do not replay uncertain mutations after reconnect without a durable idempotency-key design. Reads may retry.

### Change capture

For the stated requirement of observing all database writes, recommend PostgreSQL triggers on the seven application tables, inserting small change rows into a primary-database outbox in the same transaction. Include resource, ID, operation and old/new relevant parent IDs. This covers ORM bypasses and ordinary direct SQL INSERT/UPDATE/DELETE, and rolls back with the write. TRUNCATE/administrative restore require explicit reset handling, not assumed row-trigger coverage.

A separately supervised relay drains committed pending outbox rows, expands representation dependencies, coalesces invalidations, and broadcasts via Cable. Mark each pending row delivered only after successful publication; crashes may duplicate messages. Do not scan exclusively with id > last_id: sequence allocation is not commit ordering and can miss late commits. Outbox cleanup and bounded backlog are required. A backlog overflow/reset policy must force client resync rather than silently discard freshness.

Start with short-interval outbox polling. PostgreSQL NOTIFY may later wake the relay, but is not durable storage. Keep serial hardware IO independent of delivery work. Adding triggers requires a schema dump strategy that preserves functions/triggers, such as structure.sql, with restore tests.

Alternative: explicit application publication at all write sites is less infrastructure, but its guarantee is only instrumented application writes. It does not satisfy literal database-wide observation.

### Invalidation semantics and versions

Use distinct concepts:
1. Local cache epoch: memory retention.
2. Local record/query invalidation generation: request race protection.
3. Optional row revision: persisted-row freshness only.
4. Stream session/batch sequence: continuity and reconnect detection.

Do not overload Rails lock_version for presentation freshness. It activates optimistic locking, and a row revision cannot describe related-row, time or filesystem changes. Initial correctness uses invalidation generations and dependency events, without requiring lock_version migration.

Proposed change batches contain changed records (resource/ID/operation), query invalidations (resource, initially whole model), and representation-scope invalidations (e.g. diagram results). Future revision fields can suppress redundant refetches if they cover the entire representation.

Query invalidation is essential for unseen new records, deletions, predicate changes and ordering changes. Start conservatively invalidating model queries for relevant writes; later narrow by query predicate/order dependencies to avoid rerunning whole collections on every telemetry update.

Trace create/update/delete invalidates derived measurement/block/output representations for the affected old/new diagrams, not just the trace ID. A backdated trace may cause harmless extra refresh. Diagram enable changes invalidate output representations. Parent moves must cover both scopes; cascade deletes must notify all affected resources. HostInterface edits invalidate HostPort claimed-interface data.

### Store processing and race handling

Expose a transport-independent applyChanges entry point. Mark records/queries stale while retaining usable data. Invoke soil; useLoaders reruns accessors, which schedule deduplicated reads. New payloads advance _seq and repaint through existing behavior.

Track one in-flight read per record/query and request generation. A response started before a relevant invalidation may not clear staleness; schedule a follow-up read. Older superseded responses must not overwrite newer accepted data. Apply this to all sideloaded records and mutation responses, not just primary objects. Preserve tombstones through relevant in-flight responses so delayed queries cannot resurrect deleted records. Query generations must protect membership and empty-result changes.

Batch events and reads. Prefer existing query responses to hydrate full collections where appropriate; avoid one request per changed row when one active collection query will fetch them all. Keep pending metadata bounded with cache eviction and request lifetimes.

### Interest and epochs

Current App loads nearly all UI records, so Bloom filtering is unlikely to save much initially. Subscribe by active model, including empty queries. Exact resource/typed-ID sets are the next optimization.

If Bloom filtering is added, hash canonical resource plus typed ID; never raw ID alone. Include both generations if both remain eligible for fresh cache hits, or mark previous-generation entries stale and revalidate on promotion. Register newly accessed/in-flight IDs immediately; periodic replacement alone creates a missed-update window. Use generation acknowledgements and overlap old/new interests until handoff completes. Establish interest before reading, then reconcile after acknowledgement.

Bloom false positives are harmless extra invalidations. Stale or incomplete membership creates real missed changes. Query and dependency-scope invalidations must bypass the ID filter. Keep filter size/hash parameters bounded and versioned.

### Recovery and non-database changes

On initial connection/reconnect: establish subscription, buffer changes, mark retained records/queries stale, refetch active data, and apply concurrent events using generation guards. Discard responses from prior connection generations. Do not claim every historical notification can be replayed from Cable.

Relay heartbeat/session messages distinguish browser socket health from relay health. Missing continuity or relay restart triggers resync. Keep periodic reconciliation and refresh-on-focus initially; cache epoch advancement remains a separate memory concern. Show stale/disconnected status while retaining last known data.

Supply server time/connection-state expiry metadata and schedule a refetch at the deadline, so a dead poller becomes unknown without another write. Keep periodic/manual HostPort scans initially; later a server watcher can publish filesystem invalidations. Expiring fields must not be suppressed by an unchanged row revision.

## Implementation plan — before code changes

1. Approve architecture choices, especially HTTP-first versus immediate socket requests and database triggers versus instrumented writes.
2. Red: add RSpec coverage for wire resource naming, commit/rollback, bypass and bulk writes, dependent representations, delete/cascade behavior; add Vitest cases for store response races, empty queries, tombstones and deduplicated refetches. Use existing frontend test tooling for actual TypeScript behavior.
3. Green: implement canonical invalidation protocol and store stale/generation behavior behind direct test injection, retaining HTTP. Refactor while tests stay green.
4. Red/green: implement outbox triggers, schema restoration coverage, relay retry/restart behavior and pending-row processing. Verify late commits are not skipped.
5. Red/green: add Cable channel, cross-process development adapter configuration, resource/access validation, relay health and initial/reconnect reconciliation.
6. Integrate UX freshness/expiry handling, keep fallback reconciliation, and manually verify two browsers plus a separate writer process without commanding hardware.
7. Run relevant RSpec and frontend tests/build. Measure commit-to-render latency, outbox lag, event/query volume and memory across epochs. Verify poller IO timing remains unaffected.
8. If still desired, extract shared request dispatcher and introduce socket reads, then mutations with explicit timeout/unknown-result behavior. Add HTTP/Cable parity and interrupted-mutation tests.
9. Only after traffic measurements justify it, introduce exact ID interests then Bloom interests with handoff/race tests.

Initial target: visible database changes within roughly one second of commit on the local network under normal load. Hardware samples still arrive on the existing ten-second poll cycle. This is eventual current-state convergence, not lossless telemetry history or an atomic snapshot across all UI collections.

Sources:
- https://api.rubyonrails.org/v8.1.3/classes/ActionCable/Channel/Streams.html — Cable streams are online delivery, not replay.
- https://www.postgresql.org/docs/18/sql-notify.html — transactional notification semantics and payload limits.
