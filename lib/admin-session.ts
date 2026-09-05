import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { SESSION_COOKIE, verifyAdminToken } from '@/lib/auth';

// Split from lib/auth.ts so next/headers and the DB client (Node-only) don't
// get pulled into proxy.ts's Edge middleware bundle.

export type AdminSession = { kind: 'operator' } | { kind: 'staff'; userId: number };

// The verified admin session for the current request, or null. Operator tokens
// are pure HMAC (no DB); staff tokens are re-checked against the users table so
// a disabled account or bumped session_epoch locks the holder out immediately,
// signed cookie or not.
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const info = await verifyAdminToken(token);
  if (!info) return null;
  if (info.kind === 'operator') return { kind: 'operator' };

  const [row] = await sql<Array<{ status: string; session_epoch: number }>>`
    select status, session_epoch from users where id = ${info.userId}
  `;
  if (!row || row.status !== 'active' || Number(row.session_epoch) !== info.epoch) return null;
  return { kind: 'staff', userId: info.userId };
}

export async function isAdminSession(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

// Defense-in-depth guard for /api/admin/* handlers: proxy.ts already gates the
// path prefix, but every handler re-checks so a middleware bypass, matcher
// gap, or stale staff session never reaches a write. Returns the 401 to send,
// or null to proceed.
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await getAdminSession()) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
