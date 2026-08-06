import { NextResponse } from 'next/server';
import { listUnpaidOlderThan } from '@/lib/timesheet';
import { sendUnpaidTimesheetReminderEmail } from '@/lib/timesheet-email';

// Weekly reminder of timesheet hours still unpaid after more than a week.
// Scheduled by the `crons` entry in vercel.json. This route is NOT under
// /api/admin, so proxy.ts doesn't gate it — Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>` (when CRON_SECRET is set), which we
// require here so nobody else can trigger it.

export const dynamic = 'force-dynamic';

const UNPAID_AFTER_DAYS = 7;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = await listUnpaidOlderThan(UNPAID_AFTER_DAYS);
  if (entries.length === 0) {
    return NextResponse.json({ ok: true, unpaid: 0, emailed: false });
  }

  await sendUnpaidTimesheetReminderEmail(entries);
  return NextResponse.json({ ok: true, unpaid: entries.length, emailed: true });
}
