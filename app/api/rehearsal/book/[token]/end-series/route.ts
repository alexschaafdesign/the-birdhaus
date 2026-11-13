import { NextResponse, after } from 'next/server';
import { getBandByToken } from '@/lib/rehearsal/bands';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { bandMayEndFrom, endSeries, listBandSeries } from '@/lib/rehearsal/series-extend';
import { startOfChicagoDay } from '@/lib/rehearsal/availability';
import { sendSeriesEndedEmail } from '@/lib/rehearsal/emails';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// A band ends one of its repeating bookings from a date (Chicago). Sessions
// on or after it are cancelled; it must respect the cancel cutoff.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const band = await getBandByToken(token);
  if (!band) return NextResponse.json({ error: 'This booking link isn’t active.' }, { status: 404 });
  if (!(await checkRateLimit(`rehearsal-end:${band.id}:${getClientIp(request)}`, 20, 600))) {
    return NextResponse.json({ error: 'Too many requests — wait a few minutes and try again.' }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const seriesId = Number(body?.seriesId);
  const fromDate = typeof body?.fromDate === 'string' ? body.fromDate : '';
  if (!Number.isInteger(seriesId) || seriesId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return NextResponse.json({ error: 'Something went wrong — reload and try again.' }, { status: 400 });
  }
  const now = new Date();
  const series = (await listBandSeries(band.id, now)).find((s) => s.id === seriesId);
  if (!series) return NextResponse.json({ error: 'That series wasn’t found.' }, { status: 404 });
  const from = startOfChicagoDay(fromDate);
  const { cancelCutoffHours } = await getRehearsalSettings();
  if (!bandMayEndFrom(series.upcoming, from, now, cancelCutoffHours)) {
    return NextResponse.json(
      { error: `Sessions less than ${cancelCutoffHours} hours away can’t be cancelled online — pick a later date, or email Alex.` },
      { status: 409 },
    );
  }
  const outcome = await endSeries(seriesId, from, 'band', { bandId: band.id, now });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  after(() => sendSeriesEndedEmail(seriesId, 'band', outcome.cancelled));
  return NextResponse.json({ ok: true, cancelled: outcome.cancelled });
}
