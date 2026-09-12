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