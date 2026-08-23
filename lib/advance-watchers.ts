import { sql } from './db';
import { DEFAULT_ADVANCE_WATCHER, normalizeEmailList } from './advance-email';

// Server-side data access for the "advance watchers" list — who gets CC'd on
// every outbound advance / thread message and notified of portal activity.
// Mirrors the portal-info accessor (lib/portal-content.ts): a single default
// row, lazily seeded (with Alex's address) the first time it's read, then
// edited in the admin Settings screen. Replaces the old hardcoded
// ADVANCE_NOTIFY_EMAIL so "who sees the replies" is configurable.

// Returns the watcher emails, seeding the singleton row on first read. The
// `where not exists` guard plus the is_default partial unique index (migration
// 052) keep this idempotent.
export async function getAdvanceWatchers(): Promise<string[]> {
  await sql`
    insert into advance_watchers (emails, is_default)
    select ${sql.json([DEFAULT_ADVANCE_WATCHER])}, true
    where not exists (select 1 from advance_watchers where is_default)
  `;
  const [row] = await sql<Array<{ emails: unknown }>>`
    select emails from advance_watchers where is_default limit 1
  `;
  return normalizeEmailList(row?.emails);
}

// Replaces the watcher list. Seeds first so an update before any read still has
// a row to write. Returns the cleaned list actually stored.
export async function updateAdvanceWatchers(input: unknown): Promise<string[]> {
  const emails = normalizeEmailList(input);
  await getAdvanceWatchers();
  await sql`
    update advance_watchers
    set emails = ${sql.json(emails)}, updated_at = now()
    where is_default
  `;
  return emails;
}
