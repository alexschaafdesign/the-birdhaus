// Collapse duplicate RSVPs to one row per (show_id, lower(email)), keeping the
// most recent submission. Before deleting the older rows, their admin-set state
// is MERGED into the keeper so nothing is lost:
//   - email_list_opt_in : OR   (a prior opt-in is never dropped)
//   - arrived / paid     : OR   (+ earliest _at kept)
//   - arrived_count      : MAX
//   - buyer_email        : keeper's, else the most recent non-null among dupes
//   - credited_tickets   : keeper's, else MAX among dupes (if the column exists)
// name/guests come from the keeper (the latest submission).
//
// This is the careful pass; migration 075 additionally does a plain keep-latest
// delete as a race-window safety net before creating the unique index.
//
// Usage (per docs/db-safety.md — dev by default, run whichdb first):
//   node scripts/dedupe-rsvps.mjs            (dry run — prints the plan)
//   node scripts/dedupe-rsvps.mjs --apply    (merge + delete, in one transaction)
//   DATABASE_URL='<prod-url>' node scripts/dedupe-rsvps.mjs --apply   (prod, one-off)
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — use whatever is already in the environment
}

const apply = process.argv.slice(2).includes('--apply');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const sql = postgres(connectionString, { max: 1, ssl: sslOptionFor(connectionString) });

try {
  const [{ current_database }] = await sql`select current_database() as current_database`;
  const url = new URL(connectionString);
  console.log(`DB: ${current_database} @ ${url.host}`);
  console.log(apply ? '\n*** APPLYING (merge + delete) ***\n' : '\n(dry run — pass --apply to write)\n');

  // credited_tickets may not exist yet on a DB where migration 074 hasn't run.
  const [{ has_credited }] = await sql`
    select exists (
      select 1 from information_schema.columns
      where table_name = 'rsvps' and column_name = 'credited_tickets'
    ) as has_credited
  `;

  const groups = await sql`
    select show_id, lower(email) as email, count(*)::int as n
    from rsvps
    group by show_id, lower(email)
    having count(*) > 1
    order by show_id
  `;

  if (groups.length === 0) {
    console.log('No duplicate (show, email) groups. Nothing to do.');
    process.exit(0);
  }

  let removedTotal = 0;
  const keeperUpdates = [];
  const deleteIds = [];

  for (const g of groups) {
    const rows = await sql`
      select id, name, guests, buyer_email, arrived, arrived_at, arrived_count,
             paid, paid_at, email_list_opt_in, created_at
             ${has_credited ? sql`, credited_tickets` : sql``}
      from rsvps
      where show_id = ${g.show_id} and lower(email) = ${g.email}
      order by created_at desc, id desc
    `;
    const keeper = rows[0];
    const dupes = rows.slice(1);
    removedTotal += dupes.length;

    // credited_tickets: keeper's if set, else the largest credit among dupes
    // (null if none is set). Only meaningful where the column exists.
    let creditedMerged = null;
    if (has_credited) {
      const credits = rows.map((r) => r.credited_tickets).filter((v) => v != null);
      creditedMerged = keeper.credited_tickets ?? (credits.length ? Math.max(...credits) : null);
    }

    const merged = {
      email_list_opt_in: rows.some((r) => r.email_list_opt_in),
      arrived: rows.some((r) => r.arrived),
      paid: rows.some((r) => r.paid),
      arrived_count: Math.max(...rows.map((r) => r.arrived_count ?? 0)),
      arrived_at: rows.map((r) => r.arrived_at).filter(Boolean).sort()[0] ?? null,
      paid_at: rows.map((r) => r.paid_at).filter(Boolean).sort()[0] ?? null,
      buyer_email:
        keeper.buyer_email ?? rows.map((r) => r.buyer_email).filter(Boolean)[0] ?? null,
      credited_tickets: creditedMerged,
    };

    console.log(`show ${g.show_id} · ${g.email} · keep #${keeper.id} ("${keeper.name}", ${keeper.guests} guests)`);
    const mergeNotes = [];
    if (merged.email_list_opt_in && !keeper.email_list_opt_in) mergeNotes.push('opt-in←merged');
    if (merged.arrived && !keeper.arrived) mergeNotes.push(`arrived←merged (count ${merged.arrived_count})`);
    if (merged.paid && !keeper.paid) mergeNotes.push('paid←merged');
    if (merged.buyer_email && !keeper.buyer_email) mergeNotes.push(`buyer_email←${merged.buyer_email}`);
    if (mergeNotes.length) console.log(`   merge into keeper: ${mergeNotes.join(', ')}`);
    for (const d of dupes) console.log(`   remove #${d.id} ("${d.name}", ${d.guests} guests)`);

    keeperUpdates.push({ id: keeper.id, merged });
    deleteIds.push(...dupes.map((d) => d.id));
  }

  console.log(`\n${groups.length} group(s), ${removedTotal} row(s) to remove.`);

  if (!apply) {
    console.log('\nDry run complete. No changes made.');
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    for (const { id, merged } of keeperUpdates) {
      // Two explicit statements rather than a conditional SQL fragment, so the
      // prod run (before migration 074 adds credited_tickets) never references
      // the not-yet-existing column.
      if (has_credited) {
        await tx`
          update rsvps set
            email_list_opt_in = ${merged.email_list_opt_in},
            arrived = ${merged.arrived}, arrived_at = ${merged.arrived_at},
            arrived_count = ${merged.arrived_count},
            paid = ${merged.paid}, paid_at = ${merged.paid_at},
            buyer_email = ${merged.buyer_email},
            credited_tickets = ${merged.credited_tickets}
          where id = ${id}
        `;
      } else {
        await tx`
          update rsvps set
            email_list_opt_in = ${merged.email_list_opt_in},
            arrived = ${merged.arrived}, arrived_at = ${merged.arrived_at},
            arrived_count = ${merged.arrived_count},
            paid = ${merged.paid}, paid_at = ${merged.paid_at},
            buyer_email = ${merged.buyer_email}
          where id = ${id}
        `;
      }
    }
    if (deleteIds.length) {
      await tx`delete from rsvps where id in ${tx(deleteIds)}`;
    }
  });

  const [{ leftover }] = await sql`
    select coalesce(sum(c - 1), 0)::int as leftover from (
      select count(*) as c from rsvps group by show_id, lower(email) having count(*) > 1
    ) x
  `;
  console.log(`\nApplied. Removed ${deleteIds.length} row(s). Remaining duplicates: ${leftover}.`);
} finally {
  await sql.end();
}
