import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { createBlackout, parseBlackout } from '@/lib/rehearsal/blackouts';
import { sessionLabel } from '@/lib/rehearsal/format';

// Add a blackout. Confirmed bookings it lands on are flagged (not cancelled)
// and listed back so the page can warn.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = parseBlackout(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const hit = await createBlackout(parsed.value);
  return NextResponse.json({
    ok: true,
    conflicts: hit.map((b) => `${sessionLabel(b.startsAt, b.endsAt)} · ${b.bandName} (${b.catalogueId})`),
  });
}
