import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { cancelAdminBooking } from '@/lib/rehearsal/admin-bookings';

// Alex cancels one confirmed rehearsal, optionally emailing the band.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad booking id' }, { status: 400 });
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 2000) : '';
  const outcome = await cancelAdminBooking(id, { email: body?.email === true, reason });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome);
}
