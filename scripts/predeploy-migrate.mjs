// scripts/predeploy-migrate.mjs — runs pending migrations against PROD as part
// of the Vercel production build, so schema changes land before the new code
// that reads them goes live. Wired into the "build" script (package.json).
//
// No .env.prod.local needed here: Vercel injects the Production DATABASE_URL
// into the production build environment, and this reads it from there. That
// file is only for running prod migrations manually from a laptop.
//
// Guards, so this never touches the wrong database:
//   * Only runs when VERCEL_ENV === 'production'. Preview deploys and local
//     `npm run build` skip entirely.
//   * Aborts if DATABASE_URL points at the known dev host (ep-calm-bonus-...),
//     mirroring scripts/migrate-prod.mjs.
//
// Idempotent: migrate.mjs tracks applied migrations in schema_migrations and
// skips ones already run, so re-builds are safe.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv !== 'production') {
  console.log(
    `[predeploy-migrate] VERCEL_ENV=${vercelEnv ?? '(unset)'} — skipping (migrations only run on production deploys).`
  );
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  // Anomalous for a production build; don't silently deploy code expecting new
  // tables. Fail loudly so it's visible in the deploy logs.
  console.error('[predeploy-migrate] Production build but DATABASE_URL is unset. Aborting.');
  process.exit(1);
}

let host = '(unparseable)';
try {
  host = new URL(url).host;
} catch {
  // fall through with the placeholder
}

if (host.startsWith('ep-calm-bonus-')) {
  console.error(
    `[predeploy-migrate] DATABASE_URL points at the DEV host (${host}), not prod. Aborting.`
  );
  process.exit(1);
}

console.log(`[predeploy-migrate] Applying migrations to production: ${host}`);

// Delegate to the shared runner. migrate.mjs calls loadEnvFile('.env.local'),
// which is absent in CI (caught) — so it uses the DATABASE_URL we inherit here,
// i.e. Vercel's production value.
const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'migrate.mjs')], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
