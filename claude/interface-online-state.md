# Interface Online State

Give `HostInterface` two independent states: **enabled/disabled**, which the
operator sets from the UI, and **online/offline**, which the poller reports.
The poller holds the serial port open across poll cycles instead of reopening
it every 10 seconds, and releases it when an interface is disabled.

**Status: implemented.** Verified by specs, including the first coverage the
poller has ever had. Not yet exercised against the Pi's real adapter — see
"Verification" at the end.

## Motivation

`Poller#run_cycle` currently does this once per cycle, per interface:

```ruby
iface.modbus_client do |client|   # opens the port
  iface.devices.each { |device| poll_device(...) }
end                                # closes the port
```

Opening an RS-485 adapter is slow — the USB serial driver has to attach, and
the line needs to settle before a command will get an answer — and we pay that
cost every 10 seconds for a port we intend to use forever. Holding the client
open across cycles removes it.

Once the port is held open, the operator needs a way to get it back. Two
reasons to want it:

1. **Operational** — silence a flapping or miswired bus, or free the adapter
   for `minicom` / a firmware update without stopping the whole poller service.
2. **Phase 2 of `claude/host-port-scan.md`** — scanning a bus for Modbus
   addresses means transacting on it from the *web* process, and a half-duplex
   bus cannot carry that interleaved with a poll cycle. `enabled = false` is the
   coordination primitive that makes a future scan possible.

Scan coordination is **not** in this task. What is in scope is making the state
model good enough that a scanner can later wait for `online == false` and know
the poller has genuinely let go of the port.

## Design

### Two states, two writers

The important property is that these never get confused, because they answer
different questions and have different writers:

| | `enabled` | `online` |
| --- | --- | --- |
| Means | operator *intends* this bus to be polled | poller *is holding* the port open |
| Written by | the web process, via the UI | the poller, once per cycle |
| Survives a poller crash | yes | no (see staleness) |

Disabling is a request, not an act: the web process never touches the serial
port. It sets `enabled = false`; the poller notices within one cycle, closes the
client, and sets `online = false`. The UI shows the bus as offline only once the
poller has confirmed it, so "offline" always means the port is actually free.

### Schema

```ruby
add_column :host_interfaces, :enabled, :boolean, null: false, default: true
add_column :host_interfaces, :online,  :boolean, null: false, default: false
add_column :host_interfaces, :poller_reported_at, :datetime
add_column :host_interfaces, :connection_error, :string
```

- `enabled` backfills `true` — existing buses keep polling across the deploy.
- `online` backfills `false` and is corrected by the first poll cycle. Never
  seed it `true`: a `true` that no poller wrote is a lie about the hardware.
- `poller_reported_at` is the heartbeat, written every cycle for every
  interface the poller manages.
- `connection_error` is why the port isn't open ("No such file or directory @
  rb_sysopen - /dev/serial/by-id/usb-…"), for display. Device-level read errors
  keep living in `devices.current_state`; this column is only about the port.

### Staleness, and why `online` alone isn't enough

If the poller segfaults while holding a port, `online` stays `true` in the
database forever and the UI cheerfully reports a bus that nothing is polling.
So `online` is only believed when it is fresh:

```ruby
# HostInterface
STALE_AFTER = 35.seconds  # > 3 × Poller::POLL_INTERVAL

def connection_state
  reporting = poller_reported_at.present? && poller_reported_at >= STALE_AFTER.ago
  return online && reporting ? "releasing" : "disabled" unless enabled
  return "unknown" unless reporting

  online ? "online" : "offline"
end
```

Five states reach the UI:

| state | means |
| --- | --- |
| `online` | the poller is holding the port open |
| `offline` | the poller is reporting and could not open the port |
| `releasing` | disabled, but the poller still has the port |
| `disabled` | disabled and the port is free |
| `unknown` | no recent report — the poller is down, or has never seen this bus |

Two of these were added while building, and both earn their place:

**`releasing`** falls out of disabling being a request rather than an act. The
operator clicks Disable and the row goes `online → releasing → disabled` as the
poller confirms. Without it the UI would claim the port was free the instant the
`PATCH` succeeded, which is exactly the lie a phase-2 scanner must not believe.

**Staleness gates both directions**, not just `online`. A freshly configured bus
reads `unknown`, not `offline`: "offline" is a statement about what the poller
decided, and nothing has decided anything yet. This also matters when the poller
is simply not running — every bus reads `unknown` rather than a confident
`offline`.

A spec asserts `STALE_AFTER > Poller::POLL_INTERVAL * 2`, so changing the poll
interval can't silently make every healthy bus read as stale.

### Poller: holding connections open

`Poller` becomes stateful. It keeps `@connections`, a `host_interface_id =>
Poller::Connection` hash that outlives a cycle. Keyed by **id**, not by AR
object, so a development-mode class reload can't strand a connection behind a
stale `HostInterface` instance.

`Poller::Connection` (`app/services/poller/connection.rb`) owns:

- the open `ModBus::RTUClient`
- a **settings fingerprint** — `[port, baud_rate, data_bits, stop_bits, parity]`
  captured at open time. If an operator edits the baud rate, the fingerprint
  stops matching and the next cycle reconnects. Deliberately not `updated_at`,
  which also changes for edits that don't affect the wire.
- **cached driver instances**, `device_id => driver`, fingerprinted on
  `[driver, modbus_address]`.

Driver caching is part of this change rather than a follow-up because
`Drivers::N4D8B08#initialize` writes the input/output relationship register to
the device. Instantiating a driver per cycle means a setup write to every relay
board every 10 seconds, forever. Cached per connection, that write happens once
when the bus comes online — which is also exactly when it's needed, since a
device that was power-cycled comes back needing reconfiguration only if the bus
dropped too.

Each cycle, per interface:

1. `enabled == false` → close and drop any connection, write
   `online: false, connection_error: nil`. Nothing else happens for this bus.
2. `port_present?` is false → don't even try to open; record "port not present".
   Reuses the computed method from `claude/host-port-scan.md` and produces a
   better message than an `ENOENT` from deep inside the serial library.
3. A live connection with a matching fingerprint → reuse it.
4. Otherwise open one. Success writes `online: true, connection_error: nil`;
   failure writes `online: false` plus the message and retries next cycle.

Connections whose interface was deleted are closed and dropped at the end of
the cycle.

### Error classification

Today every exception is caught per-device. With a held-open port, the two
kinds have to be told apart:

- `ModBus::Errors::ModBusException` (timeout, CRC mismatch, illegal address) —
  **device-level**. One device is unhappy; the bus is fine. Record it in
  `current_state` and keep the port, exactly as today.
- `SystemCallError` / `IOError` — **connection-level**. The adapter was
  unplugged or the tty died. Close and drop the connection, mark the interface
  offline with the error, and let the next cycle retry.
- Anything else — treated as device-level, matching today's behaviour.

Getting this wrong in the safe direction costs one extra reconnect; getting it
wrong in the other direction means polling a dead fd forever.

### Shutdown

systemd sends `SIGTERM` on restart and deploy. Untrapped, the process dies with
`online = true` still in the database, and the UI shows a phantom bus until the
staleness window expires.

`Poller#run` traps `INT`/`TERM` to set a `@stopping` flag (Ruby's `sleep`
returns early when a trapped signal arrives), breaks the loop, then closes every
connection and marks its interface offline from normal code — not from inside
the trap handler, where locking rules make database work unsafe.

### Frontend

`HostInterfaceFields` gains `enabled`, `connection_state`, `connection_error`,
and `poller_reported_at`.

- **Interface card** — extracted from `DevicesTab.tsx` into
  `HostInterfaceCard.tsx`, because the card stopped being a single click target:
  it now carries both an **Edit** and a **Disable**/**Enable** button, and a
  button can't nest inside a button. Shows the state badge (with the meaning in
  its tooltip) and the connection error when there is one. "Give me the bus
  back" is a one-click operator gesture, not something to go hunting for in an
  edit form.
- **`HostInterfaceForm.tsx`** — an Enabled checkbox, for completeness and for
  creating a bus that shouldn't start polling yet.
- **`DeviceStateCard.tsx`** — devices on a bus that isn't online are badged
  **Stale** and their values dimmed. `current_state` is deliberately left in the
  database untouched: the last good reading is the most useful thing to look at
  when diagnosing why a bus went away, and nulling it would destroy that. But it
  must not be presented as current, which is the whole point of the badge.

### API

`HostInterfaceApi` serializes the four new fields and permits `enabled` in
create/update params. `online`, `poller_reported_at`, and `connection_error` are
**not** permitted — they are the poller's to write, and a UI that could set
`online` would be able to fake a bus being held open.

## Implementation plan

1. **Migration + model.** Four columns; `enabled`/`online` `null: false` with
   defaults. `connection_state`, `STALE_AFTER`, and the guard spec tying it to
   `Poller::POLL_INTERVAL`. Extend `spec/models/host_interface_spec.rb` with the
   four state cases, using `travel_to` for staleness.
2. **`Poller::Connection`.** Open/reuse/close, settings fingerprint, driver
   cache. Spec against a fake client — `spec/services/poller/connection_spec.rb`.
3. **Poller cycle rework.** Connection reuse, the disabled path, error
   classification, deleted-interface cleanup, signal handling.
   `spec/services/poller_spec.rb` is **new**: the poller has no coverage at all
   today (a standing TODO in `claude/deployment.md`), and this change is what
   makes it genuinely stateful, so this is the moment to pay that down. Cover:
   a port opened once and reused across two cycles; a disabled interface closing
   its port and going offline; a settings edit forcing a reconnect; a
   device-level Modbus error leaving the port open; an `IOError` dropping the
   connection; `SIGTERM` marking interfaces offline.
4. **API.** Serialize the new fields, permit `enabled`, extend
   `spec/requests/devices_spec.rb`.
5. **Frontend.** Store fields, interface card badge + toggle, form checkbox,
   stale device badge.
6. **Docs.** Update `claude/overview.md`; strike the poller-specs TODO from
   `claude/deployment.md` once step 3 lands.

Steps 1–3 are the real work and are independently verifiable on the Pi against
the live FTDI adapter: disable the bus in `psql`, watch the port get released
(`lsof /dev/ttyUSB0`), re-enable, watch it come back.

## Verification

Covered by specs:

- `spec/services/poller_spec.rb` (new) — port opened once and reused across
  cycles; driver instances reused; disable releasing the port and reporting
  offline; the `releasing → disabled` transition; re-enable reopening; a
  settings edit forcing a reconnect while a rename doesn't; a Modbus error
  keeping the port; an `Errno::EIO` dropping and then reopening it; a missing
  port never being opened; deleted interfaces released; shutdown releasing
  everything.
- `spec/services/poller/connection_spec.rb` (new) — reuse predicate, driver
  cache invalidation, pruning, tolerant close.
- `spec/models/host_interface_spec.rb` — all five states plus the
  `STALE_AFTER` / `POLL_INTERVAL` guard.
- `spec/requests/devices_spec.rb` — `enabled` round-trips; `online` and
  `connection_error` are ignored when a client tries to set them.

Fakes live in `spec/support/fake_modbus.rb`, which `rails_helper` now
auto-requires.

**Not verified**: nothing has run against the real FTDI adapter yet, and no part
of the UI has been opened in a browser. The two things most worth checking on
the Pi are that a held-open client survives many cycles without the bus wedging
(the old code got a fresh client every 10s, which may have been papering over a
driver quirk), and that `lsof` shows the port genuinely released after a
disable.

## Alternatives considered

**A `status` enum column instead of two booleans.** One column holding
`disabled | online | offline` is fewer fields, but it merges operator intent
with observed reality — the poller and the web process would both write the same
column, and "disabled" would erase the record of whether the port had been
released yet. Two booleans with different writers keep that distinction, and the
enum the UI wants is derived rather than stored.

**`LISTEN`/`NOTIFY` so disabling takes effect instantly.** The poller already
reloads `HostInterface` every cycle, so checking `enabled` is free, and the
worst-case latency is one poll interval (10s). Postgres notifications would add
a second control path into a process whose whole structure is a loop, to save
ten seconds on a rare manual action. **Deferred deliberately**: notifications
are coming later as part of a broader design change, and this feature should
pick them up then rather than inventing a one-off channel now. The
`releasing → disabled` handshake is the part that has to be right either way,
and it doesn't change when the signal gets faster.

**Timing out `online` in SQL instead of in Ruby.** Would make staleness visible
to any query, but bakes the poll interval into a default scope and makes the
model harder to test. `connection_state` in Ruby with `travel_to` in specs is
plainer.

**A `flock` on the port path instead of a database flag.** The natural fit for
phase 2's cross-process exclusion, and worth revisiting then. It doesn't answer
this task: a lock can say "someone holds the port" but not "the operator wants
this bus polled", which is the durable state the UI needs.
