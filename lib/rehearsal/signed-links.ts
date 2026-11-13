// Signed one-click links for Alex's emails (Approve / Decline now; cash
// Received / Not left in 6c). A link only opens a confirm page; the action
// itself is a POST from that page, so mail scanners that open every link
// can't approve or decline anything (decision 2).
//
// Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256). The key is
// derived from ADMIN_SESSION_SECRET with a purpose label, so a link can never
// double as a session cookie or vice versa. PURE given the secret: tested.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type LinkAction = 'approve' | 'decline';

export interface LinkPayload {
  a: LinkAction;
  k?: string; // request_key: the whole request
  b?: number; // one booking
  e: number; // expiry, unix seconds
}

export const LINK_TTL_SECONDS = 7 * 24 * 3600;

function key(secret: string): Buffer {
  return createHash('sha256').update(`rehearsal-links:v1:${secret}`).digest();
}

function mac(body: string, secret: string): string {
  return createHmac('sha256', key(secret)).update(body).digest('base64url');
}

export function signLink(
  p: Omit<LinkPayload, 'e'>,
  secret: string,
  now = new Date(),
  ttlSeconds = LINK_TTL_SECONDS,
): string {
  if (!p.k === !p.b) throw new Error('A link names a request or a booking, not both');
  const payload: LinkPayload = { ...p, e: Math.floor(now.getTime() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

export type VerifyResult = { ok: true; payload: LinkPayload } | { ok: false; reason: 'invalid' | 'expired' };

export function verifyLink(token: string, secret: string, now = new Date()): VerifyResult {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || body.length > 400) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'invalid' };

  let p: unknown;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const q = p as Partial<LinkPayload>;
  const actionOk = q.a === 'approve' || q.a === 'decline';
  const targetOk = (typeof q.k === 'string') !== (typeof q.b === 'number');
  if (!actionOk || !targetOk || typeof q.e !== 'number') return { ok: false, reason: 'invalid' };
  if (q.e * 1000 < now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, payload: q as LinkPayload };
}

export function linkSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET is not set.');
  return s;
}
