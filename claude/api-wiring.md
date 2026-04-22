# API Wiring Task

## Goal
Connect the React frontend to the Rails API using the BioTrack RestfulModelStore/DataLoader2 tooling.

## Design

### Wire Format
Aligned the HVAC Rails controller with the BioTrack wire format that RestfulModelStore expects:
- **Index**: `{ query: [ids], devices: [...], host_interfaces: [...], metadata: {...} }`
- **Show/Update**: `{ devices: [...], host_interfaces: [...], invalidates: {...} }`
- **Create**: `{ id: 123, devices: [...], invalidates: {...} }`
- Keys are pluralized underscore class names (not titlecase under "objects")

### Rails Side
- `RestfulApiController` updated: `serialize_flat()` replaces `serialize_by_class()` to produce flat response keys
- `HostInterfaceApi` + `HostInterfacesController` added
- `DeviceApi#expound` returns associated host_interfaces
- Routes: `resources :host_interfaces, :devices`

### Frontend Side
- Copied from BioTrack (`~/Work/BioTrack/analytics/web/src/analytics/lib/`):
  - `RestfulModelStore.ts` — REST data store with caching, query management, rate limiting
  - `DataLoader2.tsx` — React hook (`useLoaders`) for reactive store subscriptions
  - `MemoryStore.js` — sessionStorage-backed key-value store
  - `TreeStore.tsx` — URL hash navigation state store
  - `RateLimiter.ts` — AIMD rate limiter for HTTP requests
- All BioTrack files have `// @ts-nocheck` since they come from a looser TS config
- `src/store.ts` — axios client + RestfulModelStore instance + Device/HostInterface model definitions
- Vite proxy forwards `/devices` and `/host_interfaces` to Rails on port 3000

### App.tsx
Uses `useLoaders` to fetch devices + interfaces from the store, renders:
- Temperature boards: active channels with readings
- Relay I/O board: output/input state indicators
- Status badges, Modbus address, serial port info, poll timestamps
