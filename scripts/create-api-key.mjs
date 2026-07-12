// One-off key issuance for the public /api/public/* endpoints. Generates a
// random secret, stores only its hash in api_keys, and prints the raw key
// once — after this, the raw key is not recoverable from the DB.
//
// Usage:
//   node scripts/create-api-key.mjs <label>
//   node scripts/create-api-key.mjs twin-scene
import path from 'path';
import crypto from 'crypto';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const label = process.argv[2]?.trim();
if (!label) {
  console.error('Usage: node scripts/create-api-key.mjs <label>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

try {
  const rawKey = `bh_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  await sql`insert into api_keys (key_hash, label) values (${keyHash}, ${label})`;

  console.log(`Created API key for "${label}".`);
  console.log('');
  console.log(rawKey);
  console.log('');
  console.log('This is the only time the raw key is shown — it is not recoverable from the DB afterward.');
} finally {
  await sql.end();
}
