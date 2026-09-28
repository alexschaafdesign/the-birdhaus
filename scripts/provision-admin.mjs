// One-off: provision a staff (admin) login as a real `users` row, so the person
// can sign in through the normal "Log in" button (/login -> /api/club/login).
// A staff-role account automatically also gets the admin session cookie
// (lib/club-session.ts), which is what lights up the admin UI.
//
// It creates/refreshes the row with the crew+staff roles and a single-use
// set-password token, then prints the invite link. The account stays `invited`
// (no admin access yet) until the person opens that link and picks a password,
// which activates it — exactly the existing crew-invite flow, just from the CLI.
//
// SAFETY: dry-run by default. It prints the target DB (host + current_database)
// and what it WOULD do, but writes nothing unless you pass --commit. Follow
// docs/db-safety.md — run `node scripts/whichdb.mjs` first, and to target prod
// use a deliberate one-off prefix:
//
//   node scripts/provision-admin.mjs <email> "<name>"                 # preview (dev by default)
//   node scripts/provision-admin.mjs <email> "<name>" --commit        # write to the shell's DB
//   DATABASE_URL='<prod-url>' node scripts/provision-admin.mjs alex.schaaf@gmail.com "Alex Schaaf" --commit
import path from 'path';
import crypto from 'crypto';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const [email, name] = args.filter((a) => a !== '--commit');

if (!email || !name) {
  console.error('Usage: node scripts/provision-admin.mjs <email> "<name>" [--commit]');
  process.exit(1);
}

const normalizedEmail = email.trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
  console.error(`"${email}" does not look like an email address.`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return '(unparseable)';
  }
};

const ROLES = ['crew', 'staff'];
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 30; // matches lib/club-members.ts

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

try {
  const [{ current_database: db }] = await sql`select current_database()`;
  console.log('');
  console.log(`Target DB : ${db}`);
  console.log(`Host      : ${hostOf(connectionString)}`);
  console.log(`Account   : ${name} <${normalizedEmail}>`);
  console.log(`Roles     : ${ROLES.join(', ')}`);
  console.log('');

  if (!commit) {
    console.log('DRY RUN — nothing written. Re-run with --commit to create the account.');
    console.log('(Confirm the host above is the DB you intend to write to.)');
    process.exit(0);
  }

  // Raw token goes in the emailed/printed link; only its SHA-256 hash is stored.
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const rows = await sql`
    insert into users (email, name, setup_token_hash, setup_token_expires_at)
    values (${normalizedEmail}, ${name.trim()}, ${tokenHash},
            now() + make_interval(secs => ${INVITE_TTL_SECONDS}))
    on conflict (email) do update set
      name = excluded.name,
      setup_token_hash = excluded.setup_token_hash,
      setup_token_expires_at = excluded.setup_token_expires_at,
      invited_at = now()
    where users.status <> 'disabled'
    returning id, status
  `;

  if (rows.length === 0) {
    console.error('That account is disabled — re-enable it before re-inviting.');
    process.exit(1);
  }

  const { id, status } = rows[0];

  // Replace the role set with crew+staff (matches setRoles() in club-members).
  await sql.begin(async (tx) => {
    await tx`delete from user_roles where user_id = ${id}`;
    for (const role of ROLES) {
      await tx`insert into user_roles (user_id, role) values (${id}, ${role})`;
    }
  });

  const base = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  const invitePath = `/song-club/invite/${token}`;

  console.log(`✅ Provisioned user #${id} (status: ${status}).`);
  console.log('');
  console.log('Set-password link (single-use, expires in 30 days):');
  console.log('');
  console.log(base ? `${base.replace(/\/$/, '')}${invitePath}` : invitePath);
  console.log('');
  if (!base) {
    console.log('(Prepend the site origin, e.g. https://<your-domain>, to the path above.)');
  }
  console.log('Open it, pick a password, and you can then log in via the normal "Log in" button.');
  console.log('The account has no admin access until the password is set (this activates it).');
} finally {
  await sql.end();
}
