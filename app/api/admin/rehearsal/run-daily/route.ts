import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { runDaily } from '@/lib/rehearsal/daily';

// "Run now": the daily job on demand (staging has no cron). Forces the
// morning email even if today's already went.
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runDaily({ force: true })) });
}
