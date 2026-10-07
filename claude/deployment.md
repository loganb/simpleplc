# Deployment: Dev + Production on the Same Pi

## Design

This Raspberry Pi (Debian 12, aarch64, hostname `executivealpha`) hosts both active
development of this app and the production instance that drives real HVAC relays
over RS-485/Modbus. Two constraints shape everything below:

1. A dev working tree with in-progress edits can't also be the stable process
   controlling live hardware — they need separate code checkouts, separate
   databases, and separate processes.
2. `lib/poller.rb` requires exclusive access to the RS-485 bus (comment in that
   file: "the half-duplex RS-485 bus is never accessed concurrently"). Dev and
   prod pollers must never hold the same physical bus open at once. For now
   this is handled by using physically separate hardware for dev vs prod; see
   Future Work below for a cooperative-locking safety net.

Decisions made (native systemd, not Docker/Kamal; git worktree for deploy, not
a second clone; Puma serves the built frontend directly, no nginx) are recorded
with rationale in the implementation plan this doc was written from
(`/home/logan/.claude/plans/humble-discovering-valiant.md` at planning time —
summarized below since that path isn't durable).

### Toolchain
- `mise` manages Ruby 4.0.2 / Node 22 per `mise.toml`, for both dev and prod.
  No shell activation inside systemd units — they invoke `mise exec --` directly.

### Database
- One PostgreSQL 18 instance (via PGDG apt repo — Debian 12's default repo only
  has PG 15) serves both dev and prod. Single dedicated role `plc_controller`
  (password auth over TCP on 127.0.0.1, not peer auth, so the same credentials
  work identically whether a process is run interactively or under systemd).
  Databases are already separated by name in `config/database.yml`
  (`plc_controller_development` vs `plc_controller_production` + `_cache`/
  `_queue`/`_cable`).

### Env vars
- Dev: `.env` at repo root (gitignored), loaded via `dotenv-rails` (added to
  the Gemfile's dev/test group — the `dotenv` gem already in `Gemfile.lock` was
  only a transitive dependency of `kamal` and was not actually wired into Rails
  boot).
- Prod: `/etc/plc_controller/production.env` (root-owned, mode 600), injected
  via systemd `EnvironmentFile=`. Holds DB credentials, `RAILS_MASTER_KEY`
  (rather than a `config/master.key` file, since `git worktree` checkouts don't
  share gitignored files with each other), `SOLID_QUEUE_IN_PUMA=true`, `PORT=3001`.

### Frontend serving
- Puma serves both the JSON API and the static frontend build, same-origin —
  no nginx/Thruster/Docker. `frontend/build.mjs`'s production build injects
  `window.PLC_API_BASE = ""` into `dist/index.html` so the built app defaults
  to relative/same-origin requests; dev's esbuild-served build (port 5174,
  talking to Rails on 3000 via CORS) is unchanged.
- `config/environments/production.rb`'s `cache-control` header was changed
  from a 1-year max-age (meant for fingerprinted assets) to `no-cache`, since
  `frontend/build.mjs` emits fixed filenames (`app.js`, `app.css`) — without
  this fix, browsers would cache a deployed build indefinitely and never see
  the next deploy.

### Process supervision
- The service set is three systemd services (`plc_controller-web`,
  `plc_controller-poller`, and `plc_controller-logic-runner`), all
  `Restart=always`, grouped under `plc_controller.target` for convenience.
  Versioned
  definitions for the logic runner and updated target live in `config/systemd/`;
  production copies are installed in `/etc/systemd/system` and changes require
  `systemctl daemon-reload` before restarting the target.
  Run as the existing `logan` user (single-owner box, no separate service
  account) — `logan` is in the `dialout` group for serial port access.
  `Restart=always` matters most for the poller: it's the process actually
  writing relay outputs, so if it dies, HVAC control silently stops until
  systemd restarts it.
- Solid Queue runs in-Puma (`SOLID_QUEUE_IN_PUMA=true`) rather than as a
  separate process — the app doesn't actually use ActiveJob/ActionCable today
  (no `ApplicationJob` subclasses, no ActionCable route), so a dedicated jobs
  process would be pure overhead.
- The poller is `Poller` (`app/services/poller.rb`), an ordinary autoloadable
  class, invoked by the thin entrypoint `bin/poller`. It used to be
  `lib/poller.rb`, a script with top-level executable code (a `loop do`)
  that needed a one-off exclusion from `config.autoload_lib` to keep eager
  loading from running it during boot — first hit as a hung Puma on this
  Pi's first real production boot, since dev never eager-loads. Moving the
  logic into a class removed the need for that exception: `app/` classes only
  define code, so eager loading them is always safe.
- The logic scheduler follows the same shape: `LogicRunner`
  (`app/services/logic_runner.rb`) is invoked by `bin/logic_runner`. It creates
  due Trace records but never accesses hardware. A PostgreSQL advisory lock
  allows only one runner per application database; systemd supervises the
  production instance while Foreman runs the development instance.

### Deploy mechanism
- Production runs from a `git worktree` at `/opt/plc_controller/current`,
  checked out detached at whatever commit was last deployed — kept separate
  from the dev checkout (this one, on `main`, actively edited). `git worktree`
  was chosen over a second clone because it shares the object database and its
  restriction (same branch can't be checked out in two worktrees) is exactly
  the desired shape.
- `bin/deploy` (in the dev checkout) fetches, checks out a target commit in
  the prod worktree, installs deps, builds the frontend, copies the build into
  `public/`, runs `db:prepare`, and restarts `plc_controller.target`.

### Access
- Via the user's existing Tailscale (MagicDNS) — not LAN IP, not mDNS. Puma
  binds `0.0.0.0:3001` (its default), reachable over the tailnet.

## Future Work (deferred, not yet implemented)

- **Serial bus locking**: a `flock`-based lock keyed by serial device path,
  acquired in `Poller#run_cycle` (`app/services/poller.rb`) before opening a
  port, so a second poller pointed at the same device fails loudly instead of
  colliding with the one already driving it. Not needed today since dev and
  prod use physically separate hardware and only one poller (prod) runs at a
  time, but becomes necessary if that ever changes.
- **Postgres backups**: nightly `pg_dump` + systemd timer for the production
  database, given it holds hand-authored `logic_diagrams`/`logic_blocks`/
  `output_blocks` config that would be painful to recreate from scratch.
- ~~**Poller specs**~~ — done. `spec/services/poller_spec.rb` and
  `spec/services/poller/connection_spec.rb` were added alongside
  `claude/interface-online-state.md`, which made the poller stateful enough that
  going without coverage stopped being defensible. Fakes for the Modbus client
  and a driver live in `spec/support/fake_modbus.rb`.

## Production deployment and scan — 2026-09-26

Deployed commit `5e9df7b` with `bin/deploy`; frontend build and database migrations succeeded. Web and poller services restarted; homepage and `/up` returned HTTP 200.

Serial enumeration found FTDI FT230X adapter serial `D30I8SGW` at `/dev/ttyUSB0`, stable path `/dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_D30I8SGW-if00-port0`, plus kernel console `/dev/ttyAMA10`. Production interface 1 actually points to missing macOS path `/dev/cu.usbserial-D30E7F3F` (contrary to the historical assumption above); its three configured devices have no polling data. Configuration was left unchanged.

With the poller stopped and automatically restarted afterward, a read-only scan of addresses 1–247 at 9600 8N1 found only address 1. Holding registers 1–8 and 129–136 all returned zero, consistent with the N4D8B08 relay I/O board. Product register 247 returned IllegalDataAddress and input-register temperature reads timed out, so model identification is inferred, not definitive. No device writes were performed.


## Hardware setup deployed — 2026-09-26

Deployed 894cdcf after user authorization; pushed to origin/main. Hardware setup migration and frontend build succeeded. Web and poller services are active; /, /up, /drivers.json and /devices.json return 200. The configured FTDI bus is online and relay device 3 at address 1 has fresh successful polls without errors. Cooperative serial ownership locking is now implemented (superseding the deferred item above).

## Enumerated measurement inputs deployed — 2026-09-28

Deployed `08d67c2` after user authorization. The production build and database
preparation succeeded; both systemd services are active and `/` plus `/up`
return HTTP 200 over Tailscale. `/devices.json` exposes driver-declared `inputs`
and `outputs` for both relay boards. Both devices resumed fresh successful polls,
the interface is online, and no device or output-write errors are reported.

## Logic runner deployed — 2026-09-28

Deployed commit `99f43b7`, installed the versioned
`plc_controller-logic-runner.service` and updated `plc_controller.target`, ran
`systemctl daemon-reload`, and restarted the target. Web, poller, logic runner,
and target are active; all three services report zero restarts and `/up` returns
HTTP 200. Production's `Heat Control Logic` diagram computed traces at
23:39:21, 23:39:51, and 23:40:21 UTC, matching its 30-second update period.
The bus remained online and both relay devices resumed fresh successful polls
with no connection, device-read, or output-write errors. The deployment's npm
install reported nine existing audit findings (one low, two moderate, six high);
they were not changed as part of this backend daemon task.

## Device I/O labels deployed — 2026-09-29

Committed and deployed `cf38150` directly from the shared local Git object
database. The `devices.io_labels` JSONB migration and frontend build succeeded.
The target, web, poller, and logic-runner services are active; `/up`,
`/drivers.json`, and `/devices.json` return HTTP 200. Driver metadata exposes
default input/output catalogs and both Device records expose `io_labels` plus
effective catalogs. The relay bus is online, and devices 3 and 4 produced newer
successful polls after restart with no device or output-write errors. No
production labels were changed during verification.

Playwright smoke checks loaded both the production dashboard and a deep-linked
Device edit modal without console or page errors. The modal overlay, driver
details, and paired input/output label fields rendered correctly.

The push to `origin/main` was rejected by the execution environment because it
requires separate explicit approval for repository-source egress. Production is
therefore at local commit `cf38150` while the remote branch remains unchanged.

## Null handling and timer counter deployed — 2026-09-30

Pushed and deployed `492271d`: `??`/`coalesce` with SQL three-valued `&&`/`||`
(`389e7e7`), and `TimerCounterLogicBlock`. No migration was needed. The target,
web, poller and logic-runner services are active with zero restarts, `/up`
returns 200, and the served `app.js` includes the timer counter form. `Heat
Control Logic` kept tracing every 30 s (latest 18:55:12 UTC), and relay devices
3 and 4 polled `ok` at 18:55:2x UTC. Before the deploy, none of the four
`&&`/`||` outputs (ThirdFloorRadValve, FCUPump, BoilerCH, RadCirc) had null
inputs, so the new logic rules didn't change any relay. The
ThirdFloorRadValve/ThirdFloorFCUValve changes seen after the deploy came from a
real `ThirdFloorCall` of 1.0 with every measurement non-null. No timer counter
blocks exist in production yet. npm audit still reports the same nine
existing findings.

## Expression block deployed — 2026-09-30

Pushed and deployed `bfe5af0` (`ExpressionLogicBlock`, division by zero →
null, boolean Hysteresis inputs) at the user's direction. The auto-mode
classifier blocked the first `bin/deploy` attempt, and it went ahead after the
user explicitly approved it. No migration was needed. The target, web, poller
and logic-runner services are active with zero restarts, `/up` returns 200,
and the served `app.js` includes the expression block form. `Heat Control Logic`
kept tracing every 30 s (latest 21:49:13 UTC, no null measurements), and relay
devices 3 and 4 polled `ok` at 21:49:14 UTC. Production had no logic blocks,
so the change to how block values are stored couldn't affect live traces.

## Logic block notes deployed — 2026-09-30

Deployed `c117593` after the user's explicit authorization (the auto-mode
classifier blocked the first attempt). The `logic_blocks.notes` migration and
frontend build succeeded. The target, web, poller and logic-runner services
are active with zero restarts, `/up` returns 200, `/logic_blocks.json` returns
`notes` on all three production blocks, and the served `app.js` includes the
Notes field. `Heat Control Logic` kept tracing (22:11:33, 22:12:03 UTC), the
relay bus is online, and devices 3 and 4 polled at 22:12:15 UTC with no errors.
npm audit still reports the same nine existing findings.

## Logic card cleanup deployed — 2026-09-30

Pushed and deployed `39fe407` (frontend only, no migration) at the user's
direction. The target, web, poller and logic-runner services are active with
zero restarts, `/up` returns 200, and the served `app.js` has the new
single Output box and no longer contains "Pending poller write". Traces kept
arriving (latest 22:55:23 UTC), and relay devices 3 and 4 polled at
22:55:17–18 UTC. npm audit still reports the same nine existing findings.

## Logic diagram instances deployed — 2026-10-07

Pushed and deployed `c0bd734`. The irreversible instance migration completed
and preserved two diagrams as two instances, ten input bindings, eleven output
bindings, historical traces, schedules, and enable gates. Production preflight
found three physical relay channels shared by the active heat-control diagram
and disabled circulation-test diagram; inactive overlap is now preserved while
activation validation prevents two active writers.

Web, poller, and logic runner are active with zero restarts, and `/up` returns
200. Both instances emitted schema-v2 traces after restart. Devices 3 and 4
resumed fresh `ok` polls with no output-write errors; the active instance's
eight bindings all computed false and every physical output remained off. The
frontend install now reports one high-severity npm audit finding; it was not
changed during this deployment.
