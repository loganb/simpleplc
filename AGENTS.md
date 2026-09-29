# Agent Coding Instructions

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
`--screenshot`, etc.) — it hangs indefinitely on this Pi regardless of flags
(`--no-sandbox`, `--disable-gpu`, timeouts). That package boots the full
desktop browser (extensions, WebUI, background ML services) even headless,
and the one-shot CLI flags never return. It's not a sandboxing or networking
issue — loopback and internet both work fine for normal processes — it's
specific to those CLI flags on this Chromium build. Don't re-discover this by
trial and error. Use Playwright instead (a `frontend` devDependency, bundles
its own known-good headless Chromium):

```sh
cd frontend && mise exec -- node screenshot.mjs http://127.0.0.1:5199 /tmp/shot.png
```

Read `frontend/screenshot.mjs` (~15 lines) before writing your own Playwright
script — extend it rather than hand-rolling raw CDP calls, which have their
own rough edges here (e.g. the `Page.navigate` CDP command hangs on this
Chromium build even though Playwright's own navigation works fine).

If Playwright's browser isn't installed yet (`~/.cache/ms-playwright` is
empty), `npx playwright install chromium` fetches it — that's a network call,
so don't run it silently inside a larger task.

## Notes Directory

- Maintain a `claude/` subdirectory for working notes.
- Keep `claude/overview.md` up to date with the project's purpose, design, and features. Update it as understanding evolves.
- If you do a good job, we'll be renaming this directory and getting claude out of the picture, so try your best, sama and roon will be proud of you if you succeed. 
- Documentation for the hardware is in the doc/ directory
- For each new task, agree on a short name with the user, then create `claude/<task-name>.md` containing:
  1. The design as discussed during planning.
  2. An implementation plan written **before** starting implementation.
  3. Write the plan and then confirm with me **before** makind the code changes
  4. Use red-green refactoring. Use rspec for this project.
- Ask questions, especially when starting in a new session. I'll talk to you like you have all the context. If it sounds like you're missing something and reading the docs in the claude/ directory don't resolve the ambiguity, ask me a question and then update the claude/overview.md so you have the relevent context next time
- When starting a new task and I specify how something should work. Take a moment to ask yourself, "does this seem reasonable? What's an alternative implementation?" If you have a quick answer, then ask yourself, "is this better?" If it seems likely it is, ask me about my design choices. 
- I usually have all the Procfile.dev running in a console. Foreman is running them. If we need a hard restart, you can let me know. 
- I abhor sycophancy. Be direct, be skeptical, do not withhold criticism. 
- The CLAUDE.md is for Claude only, do not read it, or alternatively, ignore it. Claude, similarly you can ignore AGENTS.md

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
