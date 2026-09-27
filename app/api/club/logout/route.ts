import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/lib/club-session';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/song-club/login', request.url), 303);
  // Clear the club cookie and — since staff hold it too — the admin cookie, each
  // in its host-only and (production) apex variant. See clearSessionCookies.
  clearSessionCookies(response);
  return response;
}
