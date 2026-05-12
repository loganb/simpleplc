# PostgreSQL Migration

## Design

Move the Rails app from SQLite to local PostgreSQL 18 via Postgres.app on macOS. Keep the change local-development focused and do not alter Docker, Kamal, or container package setup.

Development and test use local PostgreSQL databases named `plc_controller_development` and `plc_controller_test`. Production retains Rails config defaults with separate Solid databases named `plc_controller_production`, `plc_controller_production_cache`, `plc_controller_production_queue`, and `plc_controller_production_cable`. Connection settings use local socket defaults, with environment-variable overrides for host, port, username, password, and database names.

Existing local SQLite data should be preserved through a one-time import task. The app should store Rails JSON columns as PostgreSQL `jsonb`.

## Implementation Plan

1. Update Gemfile dependencies:
   - Add `pg`.
   - Keep `sqlite3` only in development for the importer.
   - Refresh `Gemfile.lock` with `mise exec -- bundle install`.
2. Replace `config/database.yml` with PostgreSQL configuration for development, test, and production.
3. Change app migrations that declare persistent JSON columns from `json` to `jsonb`.
4. Add `lib/tasks/postgres.rake` with `postgres:import_sqlite`:
   - Source database comes from `SQLITE_DB`, defaulting to `storage/development.sqlite3`.
   - Import in foreign-key-safe order.
   - Refuse to import into non-empty target tables unless `FORCE=1`.
   - Preserve IDs and timestamps.
   - Parse JSON/JSONB columns into Ruby hashes before insert.
   - Reset PostgreSQL sequences after explicit ID imports.
5. Update `claude/overview.md` to reflect PostgreSQL.
6. Prepare PostgreSQL databases, regenerate `db/schema.rb`, run importer, compare record counts, run RSpec, and smoke check model loading.

## Verification Plan

- Run Rails and Bundler commands through `mise exec -- ...`.
- Run `mise exec -- bundle install`.
- Run `mise exec -- bin/rails db:prepare`.
- Run `mise exec -- bin/rails postgres:import_sqlite`.
- Compare source SQLite and target PostgreSQL record counts for imported app tables.
- Run `mise exec -- bundle exec rspec`.
- Run a Rails runner smoke check that loads devices, diagrams, and traces.
