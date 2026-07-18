DATABASE — READ BEFORE ANY MIGRATION OR WRITE
Neon Postgres. This DB is Birdhaus's OWN — separate from the Twin Scene / Crawlspace shared DB (see [`../twinscene/ARCHITECTURE.md`](../twinscene/ARCHITECTURE.md) for how the three repos divide data ownership; this repo's `bands` table is a local overlay, synced from Twin Scene, not the canonical one).
Dev/prod isolation — DO NOT UNDO:
* .env.local points at the Neon DEV branch (host starts with `ep-calm-bonus-...`). .envrc uses dotenv_if_exists .env.local so direnv watches the file and the shell can't go stale. Both files are gitignored.
* The shell's DATABASE_URL (exported by direnv) = DEV. scripts/migrate.mjs uses Node's process.loadEnvFile('.env.local'), which does NOT override an already-set env var — so it targets whatever the shell holds = DEV by default. This is intentional.
* scripts/whichdb.mjs prints which DB the repo is pointed at (host + current_database, and warns if the shell disagrees with .env.local). RUN IT before any write.
Rules:
* NEVER run test writes against prod. Test against the dev branch, or a seeded throwaway row with a guard that hard-fails if the target isn't the throwaway. Delete test rows after and verify zero leftovers.
* To target PROD deliberately (e.g. run a migration on prod), use a ONE-OFF prefix: DATABASE_URL='<prod-url>' node scripts/migrate.mjs Before applying, print current_database() + host and confirm it's the PROD host, not dev. Never write the prod URL to a file or commit it; never echo it back.
* Migrations are additive and sequential (scripts/migrations/*.sql), tracked in a schema_migrations table (see scripts/migrate.mjs). Apply new migrations to PROD BEFORE deploying code that reads the new tables.
* The `db:sync-twinscene` / `db:import-twinscene-bands` scripts pull FROM Twin Scene's bands API into this repo's local overlay table — they don't write back to Twin Scene's DB. Don't add a path that does without reading ARCHITECTURE.md first.
