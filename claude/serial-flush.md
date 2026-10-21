# Serial Flush

Make the poller's serial line recover from stale bytes and wedged output after a
bus fault (wires moved, a device dropping off, an adapter stalling).

## Problem

A test bench ran stably for days, then every device answered `Illegal function: 0`.
About 15 KB of `0x00` bytes were queued on the port. rmodbus never discards them:

- `RTUSlave#send_pdu` calls `clean_input_buff` before every write, which does
  `@io.flush_input` **only if the class defines it**, else `@io.flush`.
  `CCutrer::SerialPort` (ccutrer-serialport 1.1.0) has no `flush_input`, so the
  fallback runs `IO#flush` — that flushes Ruby's *output* buffer and leaves the
  kernel input queue alone. The hook was written for the old `serialport` gem.
- The port is never flushed on open either (`tcsetattr(TCSANOW)` keeps queued input).
- `read_rtu_response` takes the first two bytes it finds as slave id + function
  code with no resync, so queued zeros parse as function 0 and raise
  `IllegalFunction`. Each failure eats only a couple of bytes, and the poller
  keeps the port open (`IllegalFunction` isn't a `CONNECTION_ERRORS`), so it
  stays desynchronised.

The 0x00 flood itself is probably a line fault: our termios config sets `IGNPAR`
only, so a break condition is delivered as a `0x00` byte. Not verified on the Pi.

## Design

1. **`flush_input` / `flush_output` / `flush_io` on `CCutrer::SerialPort`**,
   via `tcflush(2)` bound through the gem's own `Termios` FFI module. Defining
   `flush_input` also revives rmodbus's per-request input flush with no further
   change. Constants are hard-coded per OS (not worth a compiler at runtime):

   | | Linux | Darwin |
   | --- | --- | --- |
   | `TCIFLUSH` | 0 | 1 |
   | `TCOFLUSH` | 1 | 2 |
   | `TCIOFLUSH` | 2 | 3 |

   Any other platform raises when the initializer loads, rather than flushing
   the wrong queue (`TCOFLUSH` would silently discard output instead of input).

2. **`ModBus::Client#flush_line`**: public wrapper that flushes both queues on
   the client's `@io` (a no-op for non-serial transports). rmodbus does not
   expose `@io`, so this avoids `instance_variable_get` in app code.

3. **`Poller::Connection#flush_line`** delegates to the client. Called:
   - once when the port is opened (the original 15 KB case);
   - from `Poller#poll_device` whenever a device fails — a read error, or an
     output write error that isn't a connection error — before the next device
     is polled and before `relocate` transacts on the bus.

   A flush that itself raises `SystemCallError`/`IOError` (EIO on a dead
   adapter) is deliberately **not** rescued: it is a `CONNECTION_ERRORS` and
   makes `poll_interface` drop and reopen the port, which is the right outcome.

### What flush-on-failure adds over the per-request flush

Once `flush_input` exists, every request already discards queued input first.
The new pieces are:

- **Output flush.** If the adapter or bus stalls, a request can sit in the tty
  output queue past its `Timeout`. When the bus recovers it is transmitted, so
  devices answer a stale request and the reply lands in the input queue ahead
  of the next real one. `TCOFLUSH` on failure drops it.
- **Flush at the moment of failure** rather than at the next send, so the
  input queue is clean regardless of what runs next (relocate, a driver's own
  reads).
- **Flush on open.**

### Alternatives considered

- **Flush inside rmodbus** (prepend on `RTUSlave#query`): covers `HardwareScan`
  and `Probe` as well, but wraps library internals more deeply. Not done; the
  poller is the long-lived consumer that needs it.
- **Reopen the port after a bus-wide failure** (every device errored for N
  cycles). Also resets the driver cache, so `configure!` reruns on devices that
  power-cycled. Needs backoff, since `online` is reported true even when every
  device errors and an unplugged bus would otherwise reopen every cycle.
  Left for a separate decision.
- **Settling delay before flushing** (so a late reply finishes arriving). Not
  done; a timed-out device is silent and a garbled reply has been fully read.

## Implementation plan

1. `config/initializers/serial_flush.rb`: tcflush binding, constants,
   `CCutrer::SerialPort#flush_input/flush_output/flush_io`, `ModBus::Client#flush_line`.
2. `Poller::Connection#flush_line`; call it in `Connection.open`.
3. `Poller#poll_device`: flush after a device read failure and after a
   non-connection output write failure.
4. `FakeRtuClient#flush_line` records calls; specs for Connection and Poller.
   A spec for the serial class using a pty (real `tcflush` against a real tty).
5. Run rspec and rubocop on touched files.

## Not verified

Specs use fakes and a pty on the dev machine. Behaviour against the Pi's RS-485
adapter (and the 0x00 flood) hasn't been exercised.
