import crypto from 'crypto';
import { sql } from './db';

// Per-show token for the door check-in kiosk (/door/<token>). Separate from the
// band/crew hub's share_token (lib/share-token.ts) on purpose: it's a different
// audience (door staff and arriving guests) with write access to the headcount,
// so it can be rotated independently and one link leaking never exposes the other.

// Unguessable, URL/address-safe hex — app-side rather than a DB default so we
// don't need a pgcrypto extension on Neon (same as share_token).
function generateDoorToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Resolves a door token back to its show id, or null if none matches. The public
// kiosk page + its token-gated tap routes call this to authorize a request purely
// by possession of the unguessable token (no admin session).
export async function getShowIdByDoorToken(token: string): Promise<number | null> {
  const trimmed = token?.trim();
  if (!trimmed) return null;
  const [row] = await sql<Array<{ id: number }>>`
    select id from shows where door_token = ${trimmed} limit 1
  `;
  return row ? Number(row.id) : null;
}

// Returns the show's door token, generating + persisting one on first use (when
// the host first opens the kiosk link from the admin RSVPs tab).
export async function getOrCreateDoorToken(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ door_token: string | null }>>`
    select door_token from shows where id = ${showId}
  `;
  if (!row) return null;
  if (row.door_token) return row.door_token;

  const token = generateDoorToken();
  await sql`update shows set door_token = ${token} where id = ${showId}`;
  return token;
}

// Rotates the token, revoking any previously shared kiosk link.
export async function regenerateDoorToken(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ id: number }>>`select id from shows where id = ${showId}`;
  if (!row) return null;
  const token = generateDoorToken();
  await sql`update shows set door_token = ${token} where id = ${showId}`;
  return token;
}
