import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { setPaymentStatus, type PaymentStatus } from '@/lib/rehearsal/decisions';

const STATUSES: PaymentStatus[] = ['unpaid', 'paid', 'comped', 'refunded'];

// One-click payment status on a confirmed booking.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null);
  const status = body?.status as PaymentStatus;
  if (!Number.isInteger(id) || id <= 0 || !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const ok = await setPaymentStatus(id, status);
  if (!ok) return NextResponse.json({ error: 'Only confirmed bookings take a payment status.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
