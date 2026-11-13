import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { bookingsByIds, setBookingGear } from '@/lib/rehearsal/decisions';
import { getRehearsalSettings, validateGearNeeded } from '@/lib/rehearsal/settings';

// Edit one session's gear (a series' gear is copied onto each occurrence, so
// a single date can differ). Labels already on the booking stay valid even
// if they've since been removed from the house list.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const [booking] = await bookingsByIds([id]);
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const { gearOptions } = await getRehearsalSettings();
  const r = validateGearNeeded(body?.gearNeeded, body?.gearNotes, gearOptions, booking.gearNeeded);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  await setBookingGear(id, r.value.gearNeeded, r.value.gearNotes);
  return NextResponse.json({ ok: true });
}
