# Host Port Scan

Scan the host for serial ports, show what's there, and let the operator turn a
discovered port into a configured `HostInterface`.

This is **phase 1** of "enumerate and select serial busses, then scan the busses
for devices". Phase 2 (Modbus address scan → create `Device` records) is
sketched at the bottom but is **not** in this task.

**Status: phase 1 implemented.** Backend verified against the Pi's real
hardware; the `ttyUSB0` FTDI adapter resolves to its by-id path and `ttyAMA10`
is correctly flagged as the kernel console. See "Verification" at the end for
what was and wasn't checked in a browser.

## Motivation

`host_interfaces.port` is free text that someone hand-types. Today the dev DB
holds `/dev/cu.usbserial-D30E7F3F` — a macOS path left over from before the app
moved onto the Pi, so the dev poller has been failing to open its bus. Prod
holds `/dev/ttyUSB0`.

`/dev/ttyUSB*` names are handed out in USB enumeration order. With one adapter
that's fine; the moment a second RS-485 adapter is added, the relay bus and the
temperature bus can swap identities across a reboot, and the app will happily
write relay commands to whatever answers at address 3. On a box that controls
HVAC hardware that's the kind of failure worth designing out before it happens.

## Design

### Port identity

A scan writes the **by-id** path into `host_interfaces.port`:

```
/dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0
```

udev derives that name from the adapter's USB vendor/product/serial, so it
follows the physical adapter across reboots, replugs, and additional adapters.
If the adapter is replaced with a different unit the path stops existing and the
bus reports as missing — a loud failure, not a silent mis-wiring. Recovering is
a re-select in the UI.

Precedence is `by_id || by_path || device`:

- **by-id** — derived from the adapter's vendor/product/serial. Survives
  reboots, replug order, and moving the adapter to a different USB socket.
- **by-path** — physical USB socket. The fallback for adapters that report no
  serial number (cheap CH340s frequently don't); udev can only create one by-id
  symlink per name, so with two such adapters at most one gets a by-id alias
  and the other gets none. Socket-bound rather than adapter-bound, which is the
  best identity available when the hardware refuses to identify itself.
- **device** — onboard UARTs (`/dev/ttyAMA10`) have neither alias, and their
  raw node is stable anyway.

The UI should say which basis a port is using, since a by-path port silently
changes meaning if someone moves the plug.

No data migration converts the existing record. Its port simply won't resolve,
the UI will show it as missing, and the scan will show `ttyUSB0` as unclaimed —
the operator fixes it with two clicks. That's the same path they'd take in the
field, so it's worth exercising.

### `name` on HostInterface

Consequence of the above: a by-id path is unreadable as a card heading. Add
`host_interfaces.name` (`null: false`, backfilled from `port`), suggested by the
scan from the adapter's USB product string (e.g. "FTDI FT230X Basic UART") and
editable. The Devices tab headlines the name and shows the port as subtext.

### Backend: enumeration

`app/services/host_port_scanner.rb` — pure filesystem reads. It never opens a
port, so it cannot disturb the poller. This is the whole reason phase 1 is easy
and phase 2 is not.

Algorithm:

1. Walk `/sys/class/tty/*`, keep entries with a `device/driver` symlink. That
   filter alone reduces this Pi's ~70 tty nodes to exactly the two real ports
   (`ttyUSB0`, `ttyAMA10`); ptys and virtual consoles have no bound driver.
2. Build `realpath → link` maps from `/dev/serial/by-id` and
   `/dev/serial/by-path`.
3. For USB ports, walk up the sysfs device tree to the first directory holding
   `idVendor`, and read `idVendor`, `idProduct`, `manufacturer`, `product`,
   `serial`.
4. For platform ports, read `device/of_node/compatible` (e.g. `arm,pl011-axi`)
   as the label.
5. Flag kernel consoles by matching against `/proc/consoles`.

Roots (`/sys/class/tty`, `/dev/serial/...`, `/proc/consoles`) are constructor
arguments defaulting to the real paths, so specs can point the scanner at a
fake sysfs tree in a tmpdir.

**Console detection matters here.** On this Pi `/proc/cmdline` has
`console=ttyAMA10,115200`, so `ttyAMA10` is the kernel serial console. Wiring a
Modbus bus onto it means fighting kernel log output for the line. The scan
returns `console: true` and the UI warns before allowing selection rather than
hiding the port outright.

### Backend: the `HostPort` resource

Discovered ports are exposed as a read-only resource so the existing
`RestfulApi` + `RestfulModelStore` machinery carries them with no new plumbing.
`RestfulApiController` only needs objects that respond to `id` and `class.name`,
so `HostPort` is a plain `Data.define` value object, not an ActiveRecord model.

Named `HostPort`, not `SerialPort`, to pair with `HostInterface` and to stay
clear of the serialport gem's namespace.

### The id is an opaque server-encoded token

**`id = Base64.urlsafe_encode64(stable_path, padding: false)`.**

The server encodes the port's stable path into a URL-safe token on the way out;
clients treat it as opaque and hand it back verbatim. The base64url alphabet is
`[A-Za-z0-9_-]`, so an id can never contain `/`, `.`, `:` or anything else that
a URL, a router, or a format parser might want to interpret. `padding: false`
keeps `=` out too. Ids run 18–86 characters for realistic paths.

Verified against the app router with `recognize_path`:

| stable_path | id len | routes with plain `resources` |
| --- | --- | --- |
| `…/by-id/usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0` | 86 | ✓ id whole, `format=nil` |
| `…/by-path/platform-xhci-hcd.0-usb-0:1:1.0-port0` | 76 | ✓ |
| `/dev/ttyAMA10` | 18 | ✓ |
| `/host_ports.json` | — | ✓ index, `format="json"` |

So the route needs no constraints and no `format:` fiddling at all:

```ruby
resources :host_ports, only: [:index, :show]
```

**Decoding is not on the request path.** Since `id` is a pure function of
`stable_path`, `by_ids` indexes a fresh scan by id and looks the id up:

```ruby
def by_ids(ids)
  index = scan.index_by(&:id)
  ids.map { |id| index[id] }
end
```

No client-supplied string is ever turned into a filesystem path and handed to
`File` or `open`. Literally decoding the id and using the result would let a
caller name any path on the box, which would then need a whitelist check against
the scan anyway — at which point the decode was never load-bearing. Unknown or
malformed ids simply miss the index and 404 through the controller's existing
`RecordNotFound` handling. There is deliberately no decoder in the codebase at
all, so there is no escape hatch sitting next to that invariant.

The sysfs tty name (`ttyUSB0`) is explicitly *not* the id: it's assigned in USB
enumeration order, i.e. the exact instability this feature exists to route
around. The store caches records by id, so a `GET /host_ports/ttyUSB0` after a
replug could return a different physical adapter under the same key, and **Use
This Port** would prefill that one. Deriving the id from `stable_path` inherits
that path's guarantees instead: for a by-id port it survives reboots, replug
order, and moving the adapter to a different USB socket, because udev builds the
name from the adapter's own vendor/product/serial rather than bus topology.

Considered and rejected: a truncated SHA256 of `stable_path`. It would be far
shorter, and since `by_ids` consults the scan regardless, reversibility is never
required by the code. But when a port vanishes between scans, a base64 id in a
log line or a bug report still says exactly which path the client asked for,
where a hash says nothing — and it has no collision surface at all. Long opaque
URLs are the cheaper cost. Decoding is a thing a human does at a prompt; the app
never does it.

Serialized fields:

| field | example |
| --- | --- |
| `id` | `L2Rldi9zZXJpYWwvYnktaWQvdXNiLUZURElf…` (base64url of `stable_path`) |
| `tty` | `ttyUSB0` — sysfs name, for display/logs only, never an identifier |
| `device` | `/dev/ttyUSB0` |
| `by_id` | `/dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_D30E7F3F-if00-port0` |
| `by_path` | `/dev/serial/by-path/platform-xhci-hcd.0-usb-0:1:1.0-port0` |
| `stable_path` | `by_id \|\| by_path \|\| device` — prefilled into `port`; `id` is its base64url encoding |
| `label` | `FTDI FT230X Basic UART` |
| `kernel_driver` | `ftdi_sio` |
| `usb_vendor_id` / `usb_product_id` | `0403` / `6015` |
| `usb_manufacturer` / `usb_product` / `usb_serial` | `FTDI` / `FT230X Basic UART` / `D30E7F3F` |
| `console` | `false` |
| `host_interface_id` | `1`, or `null` if unclaimed |

`host_interface_id` is resolved by `File.realpath`-ing every `HostInterface#port`
and matching device nodes, so an interface configured with a by-id path, a
by-path path, or a raw node all match the same discovered port.

`HostPortApi` overrides `canonicalize_ids` (keep strings), `by_ids` (filter a
scan), `by_query` (return a scan), and `serialize`. `can_create` /
`can_update` / `can_destroy` inherit `false` from `RestfulApi`, so the resource
is read-only and mutation attempts 403.

Routes: `resources :host_ports, only: [:index, :show]` — no constraints needed,
see the id section above.

### Backend: HostInterface presence

`HostInterfaceApi#serialize` gains two computed fields (no columns):

- `port_present` — does `port` currently resolve on this host
- `resolved_device` — the realpath, e.g. `/dev/ttyUSB0`, for display/debugging

Backed by `HostInterface#port_present?`, named that way rather than `present?`
because the latter is `Object#present?` — redefining it would make the record
answer "am I blank?" with "is my adapter plugged in?".

That's what surfaces "this bus is missing" in the UI without opening anything.

### Frontend

- `store.ts` — add `HostPortFields` and the `HostPort` model definition; add
  `name`, `port_present`, `resolved_device` to `HostInterfaceFields`.
- `uxTree.ts` — `DevicesUXTree` gains `showPortScan: boolean` and
  `prefillPortId: string | null`, both URL-serializable like the existing keys.
- `tabs/devices/HostPortScanner.tsx` (new) — collapsible panel listing scanned
  ports. Per row: label, stable path, kernel driver, USB serial; badges for
  *In use* (unclaimed rows get a **Use This Port** button) and *Kernel console*
  (warn on select). A **Rescan** button forces the query.
- `HostInterfaceForm.tsx` — add the `name` field; accept an optional prefill so
  **Use This Port** opens the New form with `port` = `stable_path` and `name` =
  the port label. Warn when editing an interface whose port is missing.
- `DevicesTab.tsx` — headline interfaces by name, port as subtext, *missing*
  badge when `port_present === false`. Keep a plain **Add Manually** button as
  an escape hatch for configuring a bus before its adapter is plugged in.

Selection deliberately does **not** create a record on click: baud rate and
parity aren't discoverable from the host, so the operator has to confirm them
anyway, and a prefilled form leaves no junk behind if they misclick.

## Alternatives considered

- **`GET /host_interfaces/scan` action instead of a resource.** Doesn't fit the
  `RestfulApi` pattern and would need bespoke store plumbing for a result that
  is, in fact, a list of things with stable identities.
- **by-path (physical USB socket) identity.** Better for field-replacing a dead
  adapter into the same socket with no config change; worse if anyone moves the
  plug. Rejected in favour of by-id — chosen deliberately, easy to revisit since
  the scan returns both.
- **Persisting scan results.** A scan is cheap (a few dozen sysfs reads) and
  always-fresh beats a cache that can lie about what's plugged in.

## Implementation plan

Red-green, rspec, in order:

1. **`HostPortScanner`** — spec first, against a fake sysfs tree in a tmpdir:
   USB port with full metadata, platform port with an `of_node`, a console
   port, a pty that must be excluded, a port with no by-id alias.
   `spec/services/host_port_scanner_spec.rb`.
2. **`HostPort` value object + `HostPortApi` + route + controller** — request
   spec for index/show wire format, `host_interface_id` linkage, 403 on
   create/update/destroy, and ids: a show round-trip through the encoded id, a
   404 for an id whose port is no longer present, and a 404 (not a 500) for a
   malformed id that fails base64 decoding.
   `spec/requests/host_ports_spec.rb`.
3. **`host_interfaces.name` migration** (`null: false`, backfill from `port`) +
   model validation + `port_present` / `resolved_device` serialization + strong
   params. Extend `spec/models/host_interface_spec.rb` and
   `spec/requests/devices_spec.rb`.
4. **Frontend store + uxTree types.**
5. **`HostPortScanner.tsx`** panel.
6. **`HostInterfaceForm.tsx`** name field + prefill; **`DevicesTab.tsx`**
   wiring and missing-bus badge.
7. **Update `claude/overview.md`.**

Steps 1–3 are backend and independently verifiable with `bundle exec rspec`;
4–6 need a browser check against the running Procfile.dev stack.

## Verification

Checked:

- `bundle exec rspec` — 95 examples, 0 failures (12 scanner, 10 host_ports
  request, plus the existing suite).
- `npm test` — 15 passing, including a URL round-trip of an opaque base64url
  HostPort id through the UX tree hash.
- `tsc --noEmit` clean, `npm run build` clean.
- Scanner run against the Pi's real hardware: `ttyUSB0` → by-id path with full
  FTDI descriptors, `ttyAMA10` → `console: true`, `identity_basis: "device"`.
- Live HTTP against a running server: index, show by encoded id, 404 for a
  vanished port, 404 for a malformed id, and the full create-from-scan round
  trip (the port flipped to `host_interface_id: 2`, then the test record was
  deleted, leaving the dev DB as found).
- Devices tab rendered in headless Firefox: the scan panel, "Rescan" and "Add
  Manually" appear.
- All seven frontend queries confirmed reaching Rails from a live browser
  session, `/host_ports.json` among them.

**Not** checked: the populated port rows and the "Use This Port" → prefilled
form click-through were never seen in a browser. Headless screenshots fire at
the load event, before the store's queued XHRs resolve, and neither Chromium
(times out on this Pi) nor Firefox (`--screenshot` exits immediately) could be
made to capture post-load state. Worth an eyeball on the real dev stack.

## Phase 2 (not this task): scanning a bus for devices

Recorded now because it constrains nothing here but will need a decision:

Enumerating Modbus addresses means **opening the port and transacting on it**,
and `plc_controller-web` and `plc_controller-poller` are separate systemd
services. A half-duplex RS-485 bus can't take a scan from the web process
interleaved with a poll cycle — an in-process mutex won't help across
processes. Options to weigh then:

- `flock` on the port path, honoured by both poller and scanner
- scan-request records the poller picks up and executes between cycles
- a global pause-poller flag the scanner sets and clears

Also open for phase 2: identification is weak. Only `NT48C32` has a product-ID
register (`0x00F7` = 2532); `N4DSC08` and `N4D8B08` have to be inferred from
which register ranges respond plausibly. And baud rate isn't discoverable
either, so a thorough scan is an address sweep × a baud sweep — slow, and a
reason to make it a background job rather than a synchronous request.
