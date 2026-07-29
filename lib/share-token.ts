import crypto from 'crypto';
import { sql } from './db';

// Per-show share token for the band/engineer hub page (/hub/<token>). Kept in its
// own module (deps: db only) so the advance renderer can build the hub URL without
// importing lib/show-hub.ts, which imports the advance module back (would cycle).

// Unguessable, URL/address-safe hex. App-side rather than a DB default so we don't
// need a pgcrypto extension on Neon (same as the advance reply token).
function generateShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Returns the show's share token, generating + persisting one on first use.
export async function getOrCreateShareToken(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ share_token: string | null }>>`
    select share_token from shows where id = ${showId}
  `;
  if (!row) return null;
  if (row.share_token) return row.share_token;

  const token = generateShareToken();
  await sql`update shows set share_token = ${token} where id = ${showId}`;
  return token;
}

// Rotates the token, revoking any previously shared link.
export async function regenerateShareToken(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ id: number }>>`select id from shows where id = ${showId}`;
  if (!row) return null;
  const token = generateShareToken();
  await sql`update shows set share_token = ${token} where id = ${showId}`;
  return token;
}
