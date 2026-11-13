import { NextResponse } from 'next/server';
import { runDaily } from '@/lib/rehearsal/daily';

// Rehearsal daily job, scheduled in vercel.json (13:00 UTC = 7am CST / 8am
// CDT). Not under /api/admin, so proxy.ts doesn't gate it: Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`, required here. Crons only run on the
// production deployment; staging uses admin "Run now".

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runDaily()) });
}
