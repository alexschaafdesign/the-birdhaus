// Auth primitives for Song Club portal members: scrypt password hashing,
// single-use set-password tokens, and an HMAC-signed session cookie.
//
// Unlike lib/auth.ts (which must run in the Edge middleware bundle), nothing
// here is checked in proxy.ts — /club gates itself in its pages and API routes
// — so this module can use node:crypto freely.

import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

export const CLUB_SESSION_COOKIE = 'birdhaus_club_session';
export const CLUB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

export const MIN_PASSWORD_LENGTH = 8;

// Reuses the admin session secret rather than introducing a second env var.
// Club session signatures are domain-separated (the "club:" prefix below), so
// an admin token can never verify as a club token or vice versa.
function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set.');
  return secret;
}

// --- passwords (scrypt, node built-in — no new dependency) ---

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}.${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split('.');
  if (!saltHex || !hashHex) return false;
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// --- set-password tokens (invite + password reset) ---

// The raw token goes in the emailed link; only its SHA-256 hash is stored.
export function createSetupToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashSetupToken(token) };
}

export function hashSetupToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// --- session tokens: "<memberId>.<epoch>.<issuedAt>.<hmac>" ---
//
// The epoch is users.session_epoch at issue time. Verification hands it back
// so the caller can compare against the row's current epoch — bumping the
// epoch (password change/reset, disable) invalidates every outstanding token,
// which a pure stateless HMAC could never do. Pre-epoch three-part tokens no
// longer verify; members from before the change just log in again once.

function signSession(memberId: number, epoch: number, issuedAt: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(`club2:${memberId}.${epoch}.${issuedAt}`)
    .digest('hex');
}

export function createClubSessionToken(memberId: number, epoch: number): string {
  const issuedAt = Date.now().toString();
  return `${memberId}.${epoch}.${issuedAt}.${signSession(memberId, epoch, issuedAt)}`;
}

export interface ClubTokenInfo {
  memberId: number;
  epoch: number;
}

// Returns the member id + epoch the token vouches for, or null. Callers still
// need to load the member row and check status AND that the epoch matches —
// a signed cookie must not outlive a disabled account or a password change.
export function verifyClubSessionToken(token: string | undefined | null): ClubTokenInfo | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [idPart, epochPart, issuedAt, signature] = parts;

  const memberId = Number(idPart);
  if (!Number.isInteger(memberId) || memberId <= 0) return null;
  const epoch = Number(epochPart);
  if (!Number.isInteger(epoch) || epoch <= 0) return null;

  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > CLUB_SESSION_MAX_AGE_SECONDS * 1000) return null;

  const expected = signSession(memberId, epoch, issuedAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { memberId, epoch };
}
