# WebSocket store

Status: initial record-update stream implemented and verified on 2026-09-22; browser-rendering verification remains limited as noted below. This is the current plan, replacing the earlier trigger/outbox proposal. Task name: websocket-store.

## Goal and scope

Keep already-known frontend records fresh when opted-in Active Record models are updated. Preserve synchronous cached reads, asynchronous loading and the existing useLoaders rendering integration.

For now, defer query invalidation/recomputation, query membership/order changes, discovery of newly created records, and deletion-stream design. Existing HTTP queries, manual refresh and periodic reconciliation remain available; this project does not add live query semantics.

The original direction includes requests over a WebSocket and a Bloom filter of cached record interests. Implement and verify change delivery first, retaining HTTP requests initially; socket requests and Bloom interests are staged follow-ups rather than discarded goals.

The lock-version prerequisite is complete and committed as 88da3cb. All seven application tables have lock_version. Poller writes now use validated Active Record saves, callbacks and normal updated_at updates, with bounded persistence-only retries. API payloads expose versions. See lock-version.md.

## Agreed architecture

Opted-in model concern
  -> synchronous RecordChanges publisher inside the write transaction
  -> PostgreSQL NOTIFY through Action Cable's PostgreSQL adapter
  -> adapter listener in each streaming process
  -> ModelStoreChannel: API mapping, authorization scope, client interest
  -> client record invalidation
  -> refetch stale records and render

Use standard Action Cable for WebSocket connections, subscriptions, client actions and JSON transmission. Use its PostgreSQL subscription adapter for cross-process delivery. There is no separate listener-to-Cable relay, database trigger, durable outbox, or Solid Cable hop in this path.

### Model observation and transaction semantics

Models opt in by including an observer concern; do not attach it indiscriminately to ApplicationRecord. The concern registers after_update and hands model identity plus the current lock_version to a small publisher interface. Define and test no-op-save handling so notifications represent persisted updates.

Publication must execute synchronously on the same application-database connection and transaction as the update. PostgreSQL withholds NOTIFY until commit and discards it on rollback. Do not use after_update_commit here: it creates a commit-to-publication crash gap. Do not move publication to a job or another database connection.

In installed Rails 8.1.3, the PostgreSQL Cable adapter broadcasts through ActiveRecord::Base.connection_pool.with_connection and owns a separate listening connection. This appears compatible with our single application database, but the first implementation slice must prove transactional connection reuse using real PostgreSQL connections/processes. If it does not hold, adjust the publisher/adapter boundary explicitly before proceeding.

This is a deliberate PostgreSQL-specific contract. Switching to async, Solid Cable, Redis or another connection pool requires revisiting transaction semantics. A NOTIFY failure can fail the model transaction; do not silently swallow publication errors and claim the stream is complete.

Only opted-in callback-enabled updates are captured. Direct SQL, update_all, update_columns and the historical SQLite restore bypass observation. The importer remains an explicit offline restore exception requiring reconciliation.

### Rails plumbing and process lifecycle

Configure adapter: postgresql in development and production for this stream, using the application database rather than the separate cable database. Preserve suitable test configuration for unit tests; use the real PostgreSQL adapter in transport integration tests.

One logical store subscription per browser tab/store. Each streaming process's adapter owns a dedicated PG listener connection, outside long-lived transactions, and fans out to its local subscriptions. It must listen even when writes originate in another process such as the poller.

Use an internal record-change broadcasting with a stable, bounded channel name and protocol version. Broadcast once at the writer; subscribers filter and transmit locally. Never rebroadcast every received PG event through shared pubsub, which would multiply delivery. Do not suppress a writer's own notification: clients on the same server still need it.

Mount/verify /cable, derive development/production URLs from existing API configuration, and configure allowed origins. Account for listener startup after process fork, shutdown cleanup and Rails development reloads. Wrap custom work in the Rails execution/reloading lifecycle and avoid retaining stale model classes.

### API mapping

Use canonical singular frontend resource names, e.g. device and logic_block, plus typed record IDs. Reuse/extract the existing API class convention; HysteresisLogicBlock and LatchLogicBlock map to LogicBlockApi and the frontend logic_block model.

Proposed browser payload:
  { "type": "record_updated", "resource": "logic_block", "id": 42, "lock_version": 7 }

Keep internal model observation separate from public wire mapping. The API layer determines resource identity and supplies an authorization scope. An explicit resource registry validates incoming resource/action names; never constantize arbitrary client input.

RestfulApi currently receives an HTTP controller. Extract shared resource/policy behavior so Cable does not impersonate a controller. Long-lived channels should hold connection identity and interests, not long-lived request-scoped API instances or Active Record objects. Create fresh operation contexts where needed.

### Authentication and authorization in the streaming process

There are no access controls today. Preserve a permissive policy initially; do not invent a login system in this task. Establish explicit extension points for:
- Authentication at Cable connect, yielding a principal; reject authentication failure once an authenticator is configured.
- A per-resource record scope for that principal, evaluated in the process streaming to clients.
- Shared scope/access semantics with HTTP APIs when access controls are introduced.

Publishing processes emit changes without client-specific authorization. Before transmitting anything to a browser, including identity/version tuples, the streaming process intersects authorization scope with client interest. Interest filters, including Bloom filters, never grant access. Internal all-record broadcasts must not be passed straight to browsers.

Batch candidate record IDs by resource for scope checks to avoid a database query per notification per client. Apply current authorization before transmission; a cached allow decision needs an explicit invalidation policy.

Future permissions can change during a connection. Authentication-on-connect does not freeze authorization forever. Define revalidation or disconnection on revocation and clear newly unauthorized cached client records. The authentication mechanism and revocation implementation remain future work; the policy boundary is part of this design.

### Client interests and cache epochs

Begin with exact known resource/typed-ID interests to make the already-known-record contract and handoff tests clear. Broad internal broadcasts are acceptable; server-side client delivery is filtered. Add Bloom encoding after basic transport/coherence works and measurements justify it.

RestfulModelStore uses two cache generations; reads promote previous entries. A filter for only the current epoch is insufficient if previous-generation entries remain eligible for fresh cache hits. Either include both generations, or mark previous entries stale and revalidate on promotion. Choose and test the policy before implementing interest replacement.

Register newly accessed and in-flight record interests promptly. Periodic filter replacement alone leaves a notification gap. Acknowledge interest generations, overlap old/new interest during handoff, and reconcile records after establishing interest. Apply this to sideloaded records as well as direct reads.

Bloom keys include resource and typed ID; numeric 1 and string "1" must not collide by accidental encoding. Bound filter parameters and message size. False positives may cause extra authorized notifications, never extra authorization. Discard notifications for records the store no longer retains rather than fetching unfamiliar records.

### Store staleness and response races

Keep lock_version (row revision), cache epoch (memory retention), invalidation/request generation (race protection), and connection generation (recovery) separate.

Apply update messages through a transport-independent store entry point. For retained records, compare row versions, mark stale, retain usable data and trigger soil(). Loaders rerun; accessors schedule deduplicated reads; accepted payloads advance _seq and repaint. Version zero is valid.

Track one in-flight read per record and coalesce notifications to the highest observed row version. A response below the known required version cannot clear staleness. Responses superseded by newer requests/data cannot overwrite newer accepted data. Handle primary records, sideloaded records and mutation responses consistently. Bound pending metadata by cache/request lifetime.

No stream-driven query invalidation in this phase. Existing query responses can hydrate records, but do not change the query membership protocol as part of this work.

### Derived values and non-database changes

A row version does not describe the full API representation. Measurements, blocks and outputs expose latest-trace values; output representations also depend on diagram enable state. Interface state expires with time, and port data comes from the filesystem.

The lock-version prerequisite intentionally removed equal-version repaint suppression. Keep that behavior. Direct row notifications cannot by themselves promise freshness for these derived fields.

The API mapping is the extension point for notifying already-known dependent records. The precise dependency event/version policy remains open; do not silently touch every dependent row or equate unrelated row versions. Trace creation affecting known blocks is a dependency issue, but creation-triggered dependency observation is not included automatically in the initial after_update-only scope.

Retain existing periodic/manual refresh for derived/time/filesystem data initially. Timed expiry refetches and filesystem watchers are follow-ups, not required infrastructure for the first row-update stream.

### Recovery and delivery guarantee

LISTEN/NOTIFY and Cable provide live delivery, not durable replay. The guarantee is eventual freshness of retained records after reconciliation, not delivery of every intermediate update.

On startup or reconnect, establish and confirm the listener/subscription and interests first, then reconcile known records while processing concurrent notifications. Use connection/request generations to handle races. Reconcile record contents/versions without adding live query semantics.

Distinguish PG-listener health from browser WebSocket health. A database listener interruption must invalidate stream continuity even if browser sockets stay open. The installed Rails 8.1.3 PostgreSQL adapter has no listener reconnect loop; choose either supervised process restart (forcing browser reconnect) or a small explicit recovery extension before rollout. Test failure detection and recovery rather than assuming built-in reconnection.

Keep periodic reconciliation and refresh-on-focus as fallback. Cache eviction timing is independent of freshness. Any per-session sequence numbers detect only gaps in that defined stream; they are not PostgreSQL replay cursors.

### Requests over WebSockets

After update delivery works, extract shared request dispatch/serialization for HTTP and Cable. Carry request_id, operation, resource and arguments; responses carry request_id, status and the existing flat payload. Keep unsolicited updates a distinct message type. Use fresh operation contexts and the same authorization policy.

Reads may retry after disconnect. Mutations with an unknown outcome must not automatically replay without a durable idempotency design; request correlation IDs alone do not provide idempotency.

## Implementation plan before code changes

1. Prove the publisher/transaction boundary with failing RSpec integration tests: opted-in versus unobserved model, persisted update/version, no delivery before commit, no delivery on rollback (including nested rollback), and delivery across processes. Use independent PostgreSQL connections and real commits; fixture transactions alone cannot establish this guarantee.
2. Implement the observer concern and small publisher, configuring the PostgreSQL Cable adapter. Keep model observation independent of client scope and public API names. Refactor while tests remain green.
3. Extract canonical resource mapping and a permissive scope interface. RSpec tests cover STI mapping, unknown resources, and a restrictive test policy proving unauthorized IDs never reach clients.
4. Add ModelStoreChannel, connect-authentication extension point, exact record interests, acknowledgement and local filtering. Test two streaming processes without multiplied delivery; batch scope checks.
5. Add store update handling and deduplicated stale reads. Use existing Vitest for TypeScript behavior: version zero, repeated/out-of-order notifications, stale in-flight responses, sideloads, evicted IDs and epoch/interest handoff.
6. Implement the selected listener failure strategy and client reconciliation. Test PG disconnect while sockets remain open, server restart, reconnect/bootstrap races, and bounded queues/state. Keep existing fallback refresh.
7. Verify two browsers plus a separate writer process using fake hardware. Run relevant RSpec, frontend tests/build and required checks. Measure commit-to-render latency, notification/refetch volume and memory across epochs. Normal-load target is roughly one second from database commit; hardware sampling remains every ten seconds.
8. Revisit open representation-dependency semantics and socket request dispatch as separate follow-up slices. Add Bloom interests after exact-set behavior and traffic measurements establish the need.

Implementation approved by the user on 2026-09-20. Begin with the transactional/cross-process proof, then complete the record-update stream. Recovery choice: a small PostgreSQL adapter listener extension will reconnect and explicitly tell local subscriptions to reconcile, including when their WebSockets stayed open. Both cache generations remain subscribed; exact interests are used initially.

## References

- PostgreSQL 18 NOTIFY: https://www.postgresql.org/docs/18/sql-notify.html
- PostgreSQL 18 LISTEN: https://www.postgresql.org/docs/18/sql-listen.html
- Rails Action Cable: https://guides.rubyonrails.org/action_cable_overview.html
- Rails callbacks: https://api.rubyonrails.org/v8.1.3/classes/ActiveRecord/Callbacks.html
- Installed Rails adapter inspected: actioncable-8.1.3/lib/action_cable/subscription_adapter/postgresql.rb. Recheck transaction and recovery assumptions on adapter/Rails changes.

## Implemented result (2026-09-22)

The initial record-update stream is implemented. HTTP requests remain in use; query invalidation, new-record discovery, deletion streams, dependency-derived notifications, socket request dispatch and Bloom filters remain follow-up work.

### Implemented components

- `ObservesRecordChanges` is explicitly included by Device, HostInterface, LogicDiagram, Measurement, LogicBlock (inherited by its STI subclasses), OutputBlock and Trace. Its after_update hook publishes only when lock_version changed. Normal creates and no-op saves do not publish; an actual update performed by Trace's creation callback does publish that update.
- `RecordChanges` broadcasts the internal model name/ID/version on `plc_record_changes_v1` synchronously. Real PostgreSQL tests prove writer-transaction reuse, no precommit delivery, rollback/savepoint behavior and cross-process delivery through the actual configured adapter.
- `record_postgresql` inherits Rails' PostgreSQL publisher and extends only the listener. It reconnects after PG errors, re-establishes subscriptions, sends local `stream_unavailable`/`resync_required` messages, and probes idle connection health every five seconds. No outbox, relay, database triggers or migrations were added.
- `RecordResources` shares the HTTP API-class naming convention, explicitly registers stream resources and maps STI. `RestfulApi.record_scope(principal)` is the authorization-scope extension point. It currently permits all rows.
- `ApplicationCable::Connection` supports `config.x.record_authenticator`, a callable receiving the connection and returning a principal (nil/false rejects). With no authenticator configured, connections are anonymous. This is scaffolding for future authentication, not an implemented account system.
- `ModelStoreChannel` retains exact record interests, acknowledges monotonic replacement generations, coalesces pending versions and flushes every 100 ms. It checks current authorization scopes in batches by resource before transmitting IDs. Interest/pending state is bounded to 10,000 records. Current registered table IDs are positive integers; filesystem HostPort is not streamed.
- `RecordStream` uses the official Action Cable JS client. App mount opens it and unmount closes it. It reconciles newly acknowledged interests, all retained interests after reconnect/listener recovery, and records on window focus. Both cache generations remain subscribed; background notifications do not promote unused previous-generation entries. Above the 10,000-record interest bound, live status is offline and existing HTTP refresh remains the fallback.
- `RestfulModelStore` retains usable data while stale reads are pending, deduplicates fetches, tracks required row versions and request/invalidation order, and rejects stale payloads from direct reads, sideloads and mutation responses. A higher row version takes precedence over request-start ordering; equal-version representations still use request ordering. No live-query membership logic was added.
- The app displays connecting/live/disconnected status. Periodic/manual refresh continues to cover derived values and filesystem/time changes.

### Verification

- Red/green: initial transaction/cross-process specs and store race tests failed before implementation; the final higher-version/earlier-request regression also failed before its fix.
- Full RSpec: **161 examples, 0 failures**.
- Frontend: **26 tests passed**; TypeScript `tsc` and production build passed.
- RuboCop passed for the new backend/channel/adapter/spec files; `git diff --check` passed.
- Listener integration test terminates only its own test PostgreSQL session, verifies unavailable/resync signalling and resumed delivery. Two independent adapter instances receive each publication once.
- Two actual Action Cable clients running the application RecordStream/RestfulModelStore code connected to an isolated test Puma server. A separate Rails writer updated a test device; both stores refreshed approximately **121 ms after commit** in that run. This is a smoke measurement, not a load benchmark.
- Attempted two-tab Chromium verification repeatedly stalled at navigation to localhost, while direct requests and the client smoke test succeeded. Browser rendering is therefore **not verified**. No hardware or production data was used. Temporary fixture records from interrupted smoke runs were removed.

### Running the change

Restart the Foreman API and poller processes: Cable adapter configuration and observer infrastructure require a fresh process. Ensure frontend dependencies are installed (the lockfile includes `@rails/actioncable` and its TypeScript declarations); restart the frontend watcher if it does not pick up dependencies.

Cable is mounted at `/cable`; the frontend derives ws/wss from PLC_API_BASE and the page origin. Same-origin requests are allowed. Development also allows localhost ports 5173 and 5174. Set `PLC_CABLE_ORIGINS` to a comma-separated list of additional trusted frontend origins when needed.

No database migration is required for this slice. Production was not deployed or restarted. Existing Solid Cable database configuration is left in place but is not used by this stream.
