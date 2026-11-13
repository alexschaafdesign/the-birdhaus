import { NextResponse } from 'next/server';
import { linkSecret, verifyLink } from '@/lib/rehearsal/signed-links';
import { bookingsByIds, bookingsByRequest, isLivePending } from '@/lib/rehearsal/decisions';
import { decide } from '@/lib/rehearsal/decide';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// The POST behind the confirm page that Alex's email links open. The signed
// token is the authorisation (7-day expiry); opening the link alone never
// changes anything.

export async function POST(request: Request) {
  if (!(await checkRateLimit(`rehearsal-review:${getClientIp(request)}`, 30, 600))) {
    return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const v = verifyLink(token, linkSecret());
  if (!v.ok) {
    return NextResponse.json(
      { error: v.reason === 'expired' ? 'This link has expired — use Requests in admin.' : 'This link isn’t valid.' },
      { status: 400 },
    );
  }
  const p = v.payload;
  const list = p.k ? await bookingsByRequest(p.k) : await bookingsByIds([p.b!]);
  const ids = list.filter((b) => (p.a === 'approve' ? isLivePending(b) : b.status === 'pending')).map((b) => b.id);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Nothing left to do here — it was already decided, expired or started.' }, { status: 409 });
  }
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 2000) : '';
  const result = await decide(p.a, ids, reason);
  return NextResponse.json({ ok: true, ...result });
}
