import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { bookingsByIds } from '@/lib/rehearsal/decisions';
import { sendApprovedEmail, sendDeclinedEmail } from '@/lib/rehearsal/emails';

// Resend the band's decision email (confirmation or decline) for bookings
// whose first send failed.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n) && n > 0)) {
    return NextResponse.json({ error: 'Bad ids' }, { status: 400 });
  }
  const list = await bookingsByIds(ids as number[]);
  const confirmed = list.filter((b) => b.status === 'confirmed').map((b) => b.id);
  const declined = list.filter((b) => b.status === 'declined');
  let emailed = true;
  if (confirmed.length) emailed = (await sendApprovedEmail(confirmed)) && emailed;
  if (declined.length) emailed = (await sendDeclinedEmail(declined.map((b) => b.id), declined[0].declineReason)) && emailed;
  return NextResponse.json({ ok: emailed }, { status: emailed ? 200 : 502 });
}
