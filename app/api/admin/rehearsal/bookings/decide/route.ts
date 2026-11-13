import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { decide } from '@/lib/rehearsal/decide';

// Approve or decline bookings from admin Requests, then email the band.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const ids: unknown = body?.ids;
  if ((action !== 'approve' && action !== 'decline') || !Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) return NextResponse.json({ error: 'Bad ids' }, { status: 400 });
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 2000) : '';
  const result = await decide(action, ids as number[], reason);
  if (result.changed.length === 0) {
    return NextResponse.json({ error: 'Nothing changed — already decided, expired or started.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...result });
}
