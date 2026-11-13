import { NextResponse } from 'next/server';
import { getBandByToken } from '@/lib/rehearsal/bands';
import { cancelBandBooking } from '@/lib/rehearsal/requests';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// A band cancels one of its own bookings, up to the cutoff. Token-authorised;
// the booking must belong to the token's band.

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const band = await getBandByToken(token);
  if (!band) return NextResponse.json({ error: 'This booking link isn’t active.' }, { status: 404 });

  if (!(await checkRateLimit(`rehearsal-cancel:${band.id}:${getClientIp(request)}`, 20, 600))) {
    return NextResponse.json({ error: 'Too many requests — wait a few minutes and try again.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const bookingId = Number(body?.bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return NextResponse.json({ error: 'Something went wrong — reload and try again.' }, { status: 400 });
  }
  const outcome = await cancelBandBooking(band.id, bookingId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true });
}
