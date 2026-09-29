# Claude Code Instructions

## Running Things (read this before hunting for `ruby`)

Ruby 4.0.2 and Node 22 come from **mise** (`mise.toml`), and `mise` itself lives
at `~/.local/bin/mise`, which is **not on `PATH` in a non-login shell**. So a
bare `ruby`, `bundle`, `rails`, or `npx` fails with "command not found", and
`bin/rails` fails the same way because it shebangs to `env ruby`. There is no
system Ruby to fall back to — don't go looking for one.

Prefix commands:

```sh
export PATH="$HOME/.local/bin:$PATH"
mise exec -- <command>
```

| Task | Command |
| --- | --- |
| Specs | `mise exec -- bundle exec rspec` (there is no `bin/rspec`) |
| Ruby lint | `mise exec -- bin/rubocop` |
| Frontend tests | `cd frontend && mise exec -- npm test` (vitest) |
| Frontend typecheck | `cd frontend && mise exec -- npx tsc --noEmit` |
| Frontend build | `cd frontend && mise exec -- npm run build` (esbuild → gitignored `dist/`) |
| Frontend UI screenshot | `cd frontend && mise exec -- node screenshot.mjs <url> <out.png>` (Playwright, not system `chromium` — see below) |
| Everything at once (api + frontend + poller) | `mise exec -- bin/dev` (foreman, `Procfile.dev`) |
| Poller alone | `mise exec -- bin/poller` |

Notes:

- **RSpec is the suite, not minitest.** `test/` is the stock Rails scaffold and
  is empty, so `bin/ci`'s "Tests: Rails" step (`bin/rails test`) runs zero
  tests and proves nothing. Run rspec directly.
- `bin/rubocop` has a standing backlog of pre-existing offenses (`script/`,
  `db/seeds.rb`, `lib/restful_api_controller.rb`, `app/services/logic/`, and a
  couple of specs). Check that any offense you see is in a file you actually
  touched before treating it as a regression.
- PostgreSQL runs natively on the Pi and serves dev and prod from one instance,
  separated by database name — there is no container to start.
- The Pi is the real HVAC controller. The poller writes to physical relays, so
  `bin/dev` and `bin/poller` drive hardware. See `claude/deployment.md`.

## Testing the UI with a real browser

Logan usually already has `bin/dev` (foreman) running in his own console, with
`bin/poller` driving the real relays. **Never start a second `bin/poller`** —
two pollers would both write to the same hardware. If you need a live server
for your own testing, run just the Rails half on a different port and skip
the poller:

```sh
export PATH="$HOME/.local/bin:$PATH"
mise exec -- bin/rails server -p 3002 -b 127.0.0.1 -d   # shares the same dev Postgres DB
```

**Port 3001 is production** (the systemd `plc_controller-web` service, with
its own poller — see `claude/deployment.md`). Never test against it or bind
to it. Use a spare port such as 3002, and stop the server when you're done
(`kill $(cat tmp/pids/server.pid)`).

A dev Rails server serves only the API; it doesn't serve the frontend. To load
the UI against it, build the frontend, point a copy of `dist/` at your server,
and serve that copy statically (dev CORS allows any origin):

```sh
cd frontend && mise exec -- npm run build
mkdir -p /tmp/ui && cp -r dist/. /tmp/ui/
sed -i 's|window.PLC_API_BASE = ""|window.PLC_API_BASE = "http://127.0.0.1:3002"|' /tmp/ui/index.html
(cd /tmp/ui && python3 -m http.server 5199 --bind 127.0.0.1 &)
```

**Do not use the system `chromium` CLI** (`chromium --headless --dump-dom`,
`--screenshot`, etc.). On this Pi that package boots the full desktop browser
— extensions, top-chrome WebUI, Segmentation Platform, Optimization Guide —
even in headless mode, and the one-shot CLI flags hang forever waiting on
that machinery regardless of `--no-sandbox`/`--disable-gpu`/timeouts. This
isn't a sandboxing or networking problem (loopback and internet both work
fine for normal processes) — it's specific to those CLI flags on this
Chromium build. Don't spend time re-discovering this; use Playwright
instead, which bundles its own known-good headless Chromium and is already a
frontend devDependency:

```sh
cd frontend && mise exec -- node screenshot.mjs http://127.0.0.1:5199 /tmp/shot.png
```

`frontend/screenshot.mjs` is a ~15-line script — read it before writing a
one-off Playwright script of your own, and prefer extending it over hand-
rolling raw CDP calls (fragile: e.g. the `Page.navigate` CDP command hangs
on this Chromium build even though Playwright's own navigation works fine).
Then view the PNG with the Read tool.

If Playwright's browser isn't installed yet (`~/.cache/ms-playwright` is
empty), run `npx playwright install chromium` once — it downloads a browser
over the network, so don't do it silently inside a bigger task without
mentioning it.

## Frontend Server I/O

All frontend I/O to the server goes through `RestfulModelStore` (`Store` in
`frontend/src/store.ts`): `fetch`, `queryFor`, `create`, `patch`, `destroy`.
Don't import axios or `AxiosClient` into components. If the store can't do
something, extend the store rather than going around it.

The API has no actions. State changes are a **create** or a **patch** of a
resource — never a verb endpoint like `POST /things/:id/do_something`. Model
an "action" as a field mutation (e.g. a flag) or as creating a different
record. The Devices tab still has legacy direct calls and verb endpoints being
migrated; see `claude/store-io-cleanup.md`. Don't add more.

## Commit Messages

Keep them short. A subject line plus at most a few sentences of body — the
design rationale belongs in `claude/<task-name>.md`, not in the commit.

If a commit covers more than one feature or change, list them as bullets, one
sentence each:

```
Add host port scanning

- HostPortScanner enumerates real serial ports from /sys/class/tty.
- HostInterface gains a required name and a computed port_present?.
- The Devices tab turns a selected port into a prefilled interface form.
```

## Notes Directory

- Maintain a `claude/` subdirectory for working notes.
- Keep `claude/overview.md` up to date with the project's purpose, design, and features. Update it as understanding evolves.
- For each new task, agree on a short name with the user, then create `claude/<task-name>.md` containing:
  1. The design as discussed during planning.
  2. An implementation plan written **before** starting implementation.
- Ask questions, especially when starting in a new session. I'll talk to you like you have all the context. If it sounds like you're missing something and reading the docs in the claude/ directory don't resolve the ambiguity, ask me a question and then update the claude/overview.md so you have the relevent context next time
- When starting a new task and I specify how something should work. Take a moment to ask yourself, "does this seem reasonable? What's an alternative implementation?" If you have a quick answer, then ask yourself, "is this better?" If it seems likely it is, ask me about my design choices. 