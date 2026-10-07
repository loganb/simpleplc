# Tailscale dev access

## Design

The Rails and esbuild development servers bind explicitly to `0.0.0.0` so they
are reachable through the host's Tailscale address. Rails development CORS is
permissive. Production behavior remains unchanged.

## Implementation Plan

1. Bind Rails and esbuild explicitly to `0.0.0.0` in development.
2. Allow all CORS origins in development while leaving production unchanged.
3. Run focused configuration checks and the frontend build.
4. Start `bin/dev` and verify listeners on `0.0.0.0:3000` and
   `0.0.0.0:5174`.

## Confirmation

User confirmed the narrowed implementation on 2026-09-28.

## Implementation Notes

- Rails development now binds to `0.0.0.0:3000` through `Procfile.dev`.
- `PLC_DEV_HOST` is passed to both processes. Rails permits that exact host,
  and Action Cable permits its port-5174 origin in development.
- The esbuild development server uses `PLC_DEV_HOST`, falling back to
  `0.0.0.0`; `Procfile.dev` sets the host's Tailscale DNS name so esbuild both
  binds the Tailscale address and accepts that Host header.
- Rack CORS accepts every origin in development; production keeps its previous
  origin list.
- The frontend derives its development API and WebSocket host from the page
  hostname, changing only the port to 3000. A remote Tailscale browser therefore
  calls the controller rather than the browser machine's `localhost`.
- Verified both kernel listeners on `0.0.0.0`, an HTTP 200 from
  `http://100.122.226.9:5174/`, and `access-control-allow-origin: *` from the API
  when requested through `http://100.122.226.9:3000` with the Tailscale frontend
  origin.
- Follow-up rationale: esbuild 0.25+ rejects DNS Host headers even when bound
  to `0.0.0.0`, and its API only supports one configured host rather than a
  separate host allowlist.

## 2026-10-07 follow-up

Fixed a regression exposed while testing Logic Diagram Instances: the frontend
still defaulted to `http://localhost:3000`, Rails HostAuthorization did not
permit the configured MagicDNS name, and Action Cable permitted only localhost
origins. REST CORS itself was already correct. The development defaults now use
the current page hostname and narrowly configure the shared `PLC_DEV_HOST` for
Rails HTTP and Cable access.
