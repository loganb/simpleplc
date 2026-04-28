# Live Refresh Task

## Goal

Make the frontend dashboard refresh from the backend on a timer and prevent `RestfulModelStore` caches from growing forever during long-running live sessions.

## Design

- Add periodic dashboard refresh in the UX so data loaders re-run and fetch fresh backend state without a manual browser reload. Default cadence: 5 minutes.
- Use `RestfulModelStore`'s existing `force` behavior for record fetches where applicable.
- Extend `RestfulModelStore` with cache epochs:
  - The current epoch receives all new records and query results.
  - Reads first check the current epoch, then fall back to the previous epoch, then fall through to the server.
  - Epoch advancement is immediate. Epochs are a memory management boundary, not a data freshness boundary.
  - When a new epoch starts, the older previous epoch is dropped so the cache remains bounded.
  - The store emits an event after advancing the epoch so mounted data loaders re-run their loader functions.
- Query caches need the same epoch treatment as record caches because the dashboard mainly uses `queryFor`.
- Responses from older requests may populate the latest epoch when they return. That is acceptable because the source of truth remains the backend, and the epoch mechanism only bounds cache growth.
- The existing `BaseModel#query_epoch` is not the same concept as the new cache epoch. It is a per-model query invalidation counter used to force query reloads after records of that model change, because a changed record could enter or leave any query result. Rename it to `query_version` as part of this work to avoid overloading the word epoch.
- Preferred implementation shape: wrap the existing cache `Map`s in a small two-generation cache class. It should hold `current` and `previous` maps, promote a previous-generation hit into `current` on read, and advance by discarding `previous` then moving `current` into `previous`. This keeps the cache-epoch behavior localized and lets most existing `Map` call sites stay simple.

## Implementation Plan

1. Add focused frontend tests around `RestfulModelStore` cache behavior, starting red:
   - query/read falls through from current epoch to previous epoch;
   - advancing twice drops old records;
   - epoch advancement happens immediately, even with queued IO;
   - an epoch advancement emits a store change/reload event.
2. Add cache epoch support to `RestfulModelStore`:
   - first rename the current per-model `query_epoch` invalidation counter to `query_version` without changing behavior;
   - introduce a bounded two-generation cache wrapper per model for records and queries;
   - route reads/writes through helpers so current and previous epoch lookup is consistent;
   - expose a method/timer hook to advance epochs on the configured cadence.
3. Wire loader refresh:
   - emit a store event on epoch advancement that `useLoaders` already observes, or extend `DataLoader2` minimally if a distinct event is cleaner;
   - update the app to start a refresh interval and ask the store to advance/reload at the chosen cadence.
4. Run the frontend test/build checks, then refactor names and helpers for readability once behavior is green.
5. Update `claude/overview.md` with the live-refresh/cache-epoch design after implementation details settle.

## Open Questions

- Should epoch advancement be store-wide, or per model? Your description sounds store-wide, which is simpler and keeps related device/measurement data coherent.

## Implementation Notes

- The current implementation uses a store-wide epoch advance.
- `query_epoch` was renamed to `query_version` to preserve its original meaning: a per-model query invalidation counter.
- `RestfulModelStore` now uses a `TwoGenerationCache` for model records and per-query result maps. A read checks the current map first, then promotes a previous-generation hit into the current map.
- `advanceEpoch()` immediately rotates the store's two-generation caches and emits `cacheEpochAdvanced`. Epochs are internal memory management, not freshness boundaries; in-flight responses may populate the new epoch when they return.
- `RestfulModelStore` owns the optional epoch advancement timer via `cacheEpochIntervalMs`; the app configures it to 5 minutes in `frontend/src/store.ts`.
- `queryFor()` now accepts a `force` flag, mirroring record fetches. The dashboard consumes the emitted refresh token once per loader so it forces backend query reloads after the new epoch is active without creating a reload loop.
- Added Vitest for frontend unit tests. Current tests cover two-generation cache promotion/drop behavior, forced query reloads, immediate cache epoch advancement, and the optional epoch timer. The suite runs in Node for store-level tests; use jsdom or happy-dom later if component/hook tests need browser DOM APIs.
