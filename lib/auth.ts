// Admin session auth: a signed cookie in one of two shapes.
//
//   operator  "op.<issuedAt>.<sig>"                  — the shared-password login.
//             The HMAC covers a fingerprint of ADMIN_PASSWORD, so rotating the
//             password invalidates every outstanding operator session.
//   staff     "staff.<userId>.<epoch>.<issuedAt>.<sig>" — a crew/staff account's
//             admin access (minted at club login, lib/club-session.ts). Carries
//             the user's identity and session epoch; lib/admin-session.ts
//             re-checks status + epoch against the DB, so disabling the account
//             or bumping the epoch revokes access immediately.
//
// Tokens in the pre-epoch format ("<issuedAt>.<sig>") no longer verify — they
// were irrevocable by design flaw, and rejecting them is the fix.
//
// Uses Web Crypto (not node:crypto) so this works in both the Node.js and Edge
// runtimes; anything needing the DB lives in lib/admin-session.ts instead.

export const SESSION_COOKIE = 'birdhaus_admin_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // operator: 30 days
// Staff admin cookies are shorter-lived than the club cookie: even if the
// epoch/status re-check were somehow skipped, an issued cookie ages out fast.
export const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AdminTokenInfo =
  | { kind: 'operator' }
  | { kind: 'staff'; userId: number; epoch: number };

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set.');
  return secret;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return toHex(digest);
}

async function sign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(signature);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Fingerprint of the shared admin password, folded into operator signatures.
// null (never throw) when unset: middleware verifies on every admin request,
// and a missing env var should fail closed for operator tokens only — staff
// tokens don't depend on it.
async function passwordFingerprint(): Promise<string | null> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}

export async function createOperatorSessionToken(): Promise<string> {
  const fingerprint = await passwordFingerprint();
  if (!fingerprint) throw new Error('ADMIN_PASSWORD is not set.');
  const issuedAt = Date.now().toString();
  const signature = await sign(`op:${issuedAt}:${fingerprint}`);
  return `op.${issuedAt}.${signature}`;
}

export async function createStaffSessionToken(userId: number, epoch: number): Promise<string> {
  const issuedAt = Date.now().toString();
  const signature = await sign(`staff:${userId}:${epoch}:${issuedAt}`);
  return `staff.${userId}.${epoch}.${issuedAt}.${signature}`;
}

function freshIssuedAt(issuedAt: string, maxAgeSeconds: number): boolean {
  const age = Date.now() - Number(issuedAt);
  return Number.isFinite(age) && age >= 0 && age <= maxAgeSeconds * 1000;
}

// Signature + expiry check only — no DB. Callers that admit staff tokens must
// still confirm the account is active and the epoch current (isAdminSession /
// requireAdmin in lib/admin-session.ts do); the middleware's HMAC-only check
// is just the outer gate.
export async function verifyAdminToken(
  token: string | undefined | null
): Promise<AdminTokenInfo | null> {
  if (!token) return null;
  const parts = token.split('.');

  if (parts[0] === 'op' && parts.length === 3) {
    const [, issuedAt, signature] = parts;
    if (!freshIssuedAt(issuedAt, SESSION_MAX_AGE_SECONDS)) return null;
    const fingerprint = await passwordFingerprint();
    if (!fingerprint) return null;
    const expected = await sign(`op:${issuedAt}:${fingerprint}`);
    return timingSafeEqual(signature, expected) ? { kind: 'operator' } : null;
  }

  if (parts[0] === 'staff' && parts.length === 5) {
    const [, idPart, epochPart, issuedAt, signature] = parts;
    const userId = Number(idPart);
    const epoch = Number(epochPart);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    if (!Number.isInteger(epoch) || epoch <= 0) return null;
    if (!freshIssuedAt(issuedAt, STAFF_SESSION_MAX_AGE_SECONDS)) return null;
    const expected = await sign(`staff:${userId}:${epoch}:${issuedAt}`);
    return timingSafeEqual(signature, expected) ? { kind: 'staff', userId, epoch } : null;
  }

  return null;
}
