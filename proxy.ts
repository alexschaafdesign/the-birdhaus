import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyAdminToken } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isLoginRoute = pathname === '/admin/login' || pathname === '/api/admin/login';
  const isAdminPage = pathname.startsWith('/admin') && !isLoginRoute;
  const isAdminApi = pathname.startsWith('/api/admin') && !isLoginRoute;

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  // HMAC + expiry only — the middleware can't reach the DB. Staff tokens get
  // their status/epoch re-check in lib/admin-session.ts (pages call
  // isAdminSession via the dashboard layout; API routes call requireAdmin).
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifyAdminToken(token)) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
