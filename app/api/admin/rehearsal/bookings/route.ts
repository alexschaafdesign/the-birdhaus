import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { createAdminBooking, parseAdminBooking } from '@/lib/rehearsal/admin-bookings';

// Alex adds a rehearsal from the admin Calendar: confirmed straight away,
// optionally emailed to the band (future sessions) or marked paid (any).
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = parseAdminBooking(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const outcome = await createAdminBooking(parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome);
}
