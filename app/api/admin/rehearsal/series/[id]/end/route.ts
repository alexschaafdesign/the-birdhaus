import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { endSeries } from '@/lib/rehearsal/series-extend';
import { startOfChicagoDay } from '@/lib/rehearsal/availability';
import { sendSeriesEndedEmail } from '@/lib/rehearsal/emails';

// Alex ends a band's repeating booking from a date (no cutoff); the band is emailed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null);
  const fromDate = typeof body?.fromDate === 'string' ? body.fromDate : '';
  if (!Number.isInteger(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const outcome = await endSeries(id, startOfChicagoDay(fromDate), 'admin');
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const emailed = await sendSeriesEndedEmail(id, 'admin', outcome.cancelled);
  return NextResponse.json({ ok: true, cancelled: outcome.cancelled, emailed });
}
