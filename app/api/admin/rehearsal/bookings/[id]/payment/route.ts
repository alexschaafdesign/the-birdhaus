import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { setPaymentStatus, type PaymentMethod, type PaymentStatus } from '@/lib/rehearsal/decisions';

const STATUSES: PaymentStatus[] = ['unpaid', 'paid', 'comped', 'refunded'];
const PROVIDERS: PaymentMethod[] = ['venmo', 'cash', 'square'];

// One-click payment status on a confirmed booking. `provider` says how it
// was actually paid (defaults to the method the band chose).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null);
  const status = body?.status as PaymentStatus;
  if (!Number.isInteger(id) || id <= 0 || !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const provider = PROVIDERS.includes(body?.provider) ? (body.provider as PaymentMethod) : undefined;
  const ok = await setPaymentStatus(id, status, provider);
  if (!ok) return NextResponse.json({ error: 'Only confirmed bookings take a payment status.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
