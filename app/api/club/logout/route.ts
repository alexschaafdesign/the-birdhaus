import { NextResponse } from 'next/server';
import { CLUB_SESSION_COOKIE } from '@/lib/club-auth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/club/login', request.url), 303);
  response.cookies.delete(CLUB_SESSION_COOKIE);
  return response;
}
