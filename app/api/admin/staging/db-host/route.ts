import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { sql } from '@/lib/db';
import { isStaging } from '@/lib/staging';

// Which database the staging site is reading, for checking the deploy is on the
// staging-2027 Neon branch: the endpoint id (first label of the host) and the
// database name. Never the URL, user or password.
//
// 404 everywhere but staging — the not-staging check runs first, so on the
// production site (before or after the 2027 launch) this answers nothing, even
// to staff. Staff-only on staging (requireAdmin; check:guards enforces it).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isStaging(request.headers.get('host'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const denied = await requireAdmin();
  if (denied) return denied;

  let endpoint = '(unparseable)';
  try {
    endpoint = new URL(process.env.DATABASE_URL ?? '').hostname.split('.')[0];
  } catch {
    // leave the placeholder
  }
  const [row] = await sql<{ database: string }[]>`select current_database() as database`;
  return NextResponse.json({ endpoint, database: row.database });
}
