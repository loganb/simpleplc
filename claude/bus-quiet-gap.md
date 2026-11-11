# Bus Quiet Gap

Status: committed on `main` and deployed at `50b09c3` on 2026-11-10 with a 50 ms gap and per-line poller log timestamps. Whether the gap prevents the board hang remains unverified.

Leave a fixed stretch of silence on the RS-485 bus between every Modbus
transaction, to try to stop the N4D8B08 relay board at address 2 (device 4)
from hanging.

## Problem

Device 4 has hung twice, and each time it stopped answering until it was
power-cycled:

| Run | Update period | Bus duty | Time to hang | Polls of device 4 |
| --- | --- | --- | --- | --- |
| 2026-10-24 early | 1 s | ~100% (cycles took 1.2–1.37 s, so the poller never slept) | ~23 min | ~1,150 |
| 2026-10-24 → 25 | 10 s | ~14% | ~10 h | ~3,600 |

Both times, device 4's polls had all succeeded right up to the hang (no timeouts,
no write errors). Then every read timed out. No other device was affected. The
cable is twisted pair with 150 Ω termination at both ends, and the 24 V supply
is ample.

rmodbus enforces no silence between transactions:

- `RTUSlave#send_pdu` transmits the instant it is called. Its caller is either
  the next request in the same driver (`N4D8B08#read` makes two back-to-back
  reads, `WJ150#read` three) or the next device.
- `Client::Slave#query` resends at once after a timeout, so a reply that
  arrives late can collide with the resend.

Modbus RTU requires at least 3.5 character times of silence between frames
(4.0 ms at 9600 8N1). Today the slow devices and the FTDI's 16 ms latency timer
happen to leave gaps, but nothing guarantees them. A slave whose firmware
detects the end of a frame by silence, with a small RX buffer, can run two
frames together and overflow the buffer.

**Caveat:** the hang isn't proportional to poll count (it survived 3× more
polls at 10 s), so this is a guess, not a diagnosis. If the board still hangs
with gaps in place, the next suspects are relay switching events and the
board's firmware itself. See "Follow-ups".

## Design

### Where the gap lives

On the **serial port object**, not on a slave or the poller. Every
`RTUSlave` built by `client.with_slave(addr)` shares the client's `@io`, and
the bus is a property of the port. So the gap covers the poller, `HardwareScan`,
`Probe`, and the `script/` tools without each one opting in.

A new initializer, `config/initializers/bus_quiet_gap.rb`, prepended to
`ModBus::RTUSlave`:

- `CCutrer::SerialPort` gains `quiet_gap` (seconds, default
  `DEFAULT_QUIET_GAP`) and `quiet_until` (a monotonic timestamp, initially 0).
- `send_pdu`: before transmitting, sleep until `quiet_until`. After the write,
  set `quiet_until = now + transmit_time(msg) + quiet_gap`.
  `transmit_time` = bytes × bits-per-char ÷ baud. The write returns when the
  bytes are queued, not when they're on the wire, so this matters for
  broadcast writes (uid 0), which get no reply.
- `read_pdu`: in an `ensure`, set `quiet_until = now + quiet_gap`. The `ensure`
  also runs when `Timeout` interrupts a read, so a retry after a timeout waits
  the gap first. That covers the late-reply collision case for free.
- IO objects that don't respond to `quiet_until` (TCP, spec fakes) are left
  alone.

The time base is `Process.clock_gettime(CLOCK_MONOTONIC)`, so the gap isn't
affected by wall-clock jumps.

### Gap length

`DEFAULT_QUIET_GAP = 0.02` (20 ms): 5× the spec minimum at 9600 baud, and
comfortably above the FTDI latency timer. About 12 transactions per poll
cycle adds ~0.25 s to a cycle that already takes ~1.25 s. That's irrelevant at
a 10 s period, and still under 2 s at 1 s.

**Decided: 50 ms** (adds ~0.6 s per cycle). Since this is an experiment, a
generous gap makes the effect obvious; tune it down later if it works.

It's a constant, not a `HostInterface` column. Adding a column and UI for a
setting we don't yet know matters is premature. If it proves useful, it can
become per-interface later.

### Interaction with the read timeout

`query` wraps `send_pdu` + `read_pdu` in `Timeout.timeout(read_retry_timeout)`,
so the sleep before sending counts against the poller's 0.5 s timeout. With a
50 ms gap that leaves 450 ms for the reply, and devices reply in ~100 ms today.
I'll leave `READ_RETRY_TIMEOUT` alone rather than reach into `query`.

### Alternatives considered

- **Sleep in `Poller#poll_device` between devices.** Simpler, but it misses the
  back-to-back reads inside a driver (the N4D8B08's two reads, which go to the
  board that hangs), the immediate retry after a timeout, and `HardwareScan`.
- **Prepend on `Client::Slave#query`** instead of `send_pdu`/`read_pdu`. One
  hook, but rmodbus's own retry loop runs inside `query`, so a retry wouldn't
  get a gap.
- **Fork or monkeypatch rmodbus's `read` to use `VMIN`/`VTIME` framing.**
  Doesn't address the inter-frame silence.

## Implementation plan (red-green, rspec)

1. `spec/initializers/bus_quiet_gap_spec.rb`, failing first:
   - Uses a fake IO (records write times, scripted replies, `quiet_until` /
     `quiet_gap` accessors) and a real `ModBus::RTUSlave`. Two consecutive
     `holding_registers[...]` reads leave at least `quiet_gap` between the end
     of the first reply and the second write.
   - After a timeout, the resend waits the gap.
   - A broadcast write (uid 0) followed by a request waits transmit time + gap.
   - An IO without the accessors is unaffected (no sleep, no error).
   - `CCutrer::SerialPort` against a pty: `quiet_gap` defaults to
     `DEFAULT_QUIET_GAP` and `quiet_until` starts at 0.
2. Implement `config/initializers/bus_quiet_gap.rb`. It must load after
   `rmodbus_encoding_patch.rb`, whose `send_pdu` replaces rmodbus's. Use
   `prepend` so the order doesn't matter, and check that in the spec.
3. Run the full rspec suite. `spec/services/poller_spec.rb` uses
   `FakeRtuClient`, so it should be unaffected. Then rubocop on touched files.
4. Update `claude/overview.md` with a line on the bus gap.
5. Deploy (your call on timing). Watch the poller's cycle-time summary: expect
   roughly +0.25 s (20 ms gap) or +0.6 s (50 ms).

## As built

- `config/initializers/bus_quiet_gap.rb`: `CCutrer::SerialPort#quiet_gap`,
  `#quiet_until`, `#char_time`, and the `BusQuietGap` module prepended to
  `ModBus::RTUSlave`.
- `spec/initializers/bus_quiet_gap_spec.rb`: a pty with a responder thread
  playing the slave. With the prepend disabled, the four timing examples fail.
  A pty refuses parity and 2 stop bits, so the `char_time` framing example stubs
  those readers.
- `bin/poller`: `$stdout.sync = true` (decided in planning; it was a follow-up
  below). Under systemd, stdout is a pipe and Ruby block-buffers it.
- **`HardwareScan` uses a 0.2 s read timeout,** so 50 ms of it now goes to the
  gap, leaving 150 ms for a reply. Watch for spurious "no answer" results in
  scans; if they appear, raise the scan's timeout.

## Follow-ups (not in this task)

- **Back off a dead device.** Today a hung device costs 2 × 0.5 s of timeouts
  every cycle forever. Polling it less often after N consecutive failures
  would cut that.
- **Correlate the hang with relay switching.** `traces` has the logic outputs
  for device 4's channels. If the next hang lines up with a relay change, that
  points at the board (coil EMI or the firmware's write path) rather than bus
  timing.
- **`N4D8B08#configure!` writes register 0xFD unconditionally** on every
  connection open. Make it read-then-write like `WJ150#write_if_changed`.

## Not verified

Whether gaps stop the hang. That only shows up on the bus, over hours to days.
