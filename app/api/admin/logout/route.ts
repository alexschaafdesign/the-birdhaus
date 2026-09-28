import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { clearSessionCookies } from '@/lib/club-session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear only the admin cookie, in its host-only and (production) apex variant.
  clearSessionCookies(response, [SESSION_COOKIE]);
  return response;
}
