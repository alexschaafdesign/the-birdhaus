import { sql } from '@/lib/db';

// Best-effort client IP for keying rate limits. On Vercel the real client IP is
// the first entry in x-forwarded-for; x-real-ip is a fallback. Never trust this
// for auth — it's only used to bucket abuse.
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

// Fixed-window limiter backed by the rate_limit_hits table. Returns true if the
// request is allowed (and records it), false if the caller is over `limit`
// within the trailing `windowSeconds`.
//
// Fails OPEN: if the DB is unreachable we allow the request rather than lock
// everyone out — the endpoints this guards have their own validation, and a
// rate-limit outage shouldn't take down login/RSVP entirely.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    // Prune this key's expired rows first so the table can't grow unbounded;
    // it also keeps the count query cheap.
    await sql`
      delete from rate_limit_hits
      where key = ${key}
        and created_at <= now() - make_interval(secs => ${windowSeconds})
    `;

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from rate_limit_hits where key = ${key}
    `;

    if (count >= limit) return false;

    await sql`insert into rate_limit_hits (key) values (${key})`;
    return true;
  } catch (err) {
    console.error('[rate-limit] check failed, allowing request:', err);
    return true;
  }
}
