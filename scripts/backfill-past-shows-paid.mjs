// One-time backfill: mark every past show as fully paid out — all its bands
// paid, plus the sound engineer and photographer paid. Clears the post-show
// "N bands unpaid" / "Sound engineer unpaid" / "Photographer unpaid" tags for
// shows that happened before the payout-tracking feature existed.
//
// "Past" = show.date < today in America/Chicago, matching getTodayCentral() in
// the app so the boundary lines up with what the Shows list treats as past.
//
// Writes performed (only with --apply):
//   1. show_bands.paid = true          for every band on a past show
//   2. settlements.sound_paid = true,
//      settlements.photographer_paid = true   for past shows that have a settlement
//   3. a bare settlement row (sound_paid = true) is created for any past show
//      that names a sound engineer but has no settlement yet — otherwise its
//      "Sound engineer unpaid" tag (the name lives on the shows table) can't clear
//
// Usage:
//   node scripts/backfill-past-shows-paid.mjs            (dry run — prints what it WOULD do)
//   node scripts/backfill-past-shows-paid.mjs --apply    (actually writes)
//
// Safe to re-run: only touches rows that aren't already in the target state.
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const apply = process.argv.slice(2).includes('--apply');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

// Match the app's notion of "today" (America/Chicago) for the past-show cutoff.
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

try {
  const [{ current_database, host }] = await sql`
    select current_database() as current_database, inet_server_addr()::text as host
  `;
  const url = new URL(connectionString);
  console.log(`DB: ${current_database} @ ${url.host}  (server addr ${host ?? 'n/a'})`);
  console.log(`Cutoff: past = show date < ${today}`);
  console.log(apply ? '\n*** APPLYING WRITES ***\n' : '\n(dry run — pass --apply to write)\n');

  // What we'd change, computed live.
  const [bands] = await sql`
    select count(*)::int n
    from show_bands sb join shows s on s.id = sb.show_id
    where s.date < ${today} and sb.paid = false
  `;
  const [settlements] = await sql`
    select count(*)::int n
    from settlements st join shows s on s.id = st.show_id
    where s.date < ${today} and (st.sound_paid = false or st.photographer_paid = false)
  `;
  const missingSettlementRows = await sql`
    select s.id, s.title, s.date::text as date, s.sound_engineer_name
    from shows s
    where s.date < ${today}
      and coalesce(trim(s.sound_engineer_name), '') <> ''
      and not exists (select 1 from settlements st where st.show_id = s.id)
    order by s.date
  `;

  console.log(`Bands to mark paid:                 ${bands.n}`);
  console.log(`Existing settlements to mark paid:  ${settlements.n}`);
  console.log(`Settlement rows to create (sound):  ${missingSettlementRows.length}`);
  for (const s of missingSettlementRows) {
    console.log(`   + create settlement for #${s.id} ${s.date} "${s.title}" (sound: ${s.sound_engineer_name})`);
  }

  if (!apply) {
    console.log('\nDry run complete. No changes made.');
    await sql.end();
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    const b = await tx`
      update show_bands sb set paid = true
      from shows s
      where sb.show_id = s.id and s.date < ${today} and sb.paid = false
    `;
    const st = await tx`
      update settlements st set sound_paid = true, photographer_paid = true, updated_at = now()
      from shows s
      where st.show_id = s.id and s.date < ${today} and (st.sound_paid = false or st.photographer_paid = false)
    `;
    const created = await tx`
      insert into settlements (show_id, sound_paid)
      select s.id, true
      from shows s
      where s.date < ${today}
        and coalesce(trim(s.sound_engineer_name), '') <> ''
        and not exists (select 1 from settlements x where x.show_id = s.id)
    `;
    console.log(`\nBands updated:               ${b.count}`);
    console.log(`Settlements updated:         ${st.count}`);
    console.log(`Settlement rows created:     ${created.count}`);
  });

  // Verify nothing is left unpaid for past shows.
  const [leftBands] = await sql`
    select count(*)::int n from show_bands sb join shows s on s.id = sb.show_id
    where s.date < ${today} and sb.paid = false
  `;
  const [leftSound] = await sql`
    select count(*)::int n from shows s
    where s.date < ${today} and coalesce(trim(s.sound_engineer_name), '') <> ''
      and coalesce((select st.sound_paid from settlements st where st.show_id = s.id), false) = false
  `;
  const [leftPhotog] = await sql`
    select count(*)::int n from settlements st join shows s on s.id = st.show_id
    where s.date < ${today} and coalesce(trim(st.photographer_name), '') <> '' and st.photographer_paid = false
  `;
  console.log('\nVerification (should all be 0):');
  console.log(`  Unpaid bands on past shows:        ${leftBands.n}`);
  console.log(`  Unpaid sound engineers (w/ name):  ${leftSound.n}`);
  console.log(`  Unpaid photographers (w/ name):    ${leftPhotog.n}`);
} finally {
  await sql.end();
}
