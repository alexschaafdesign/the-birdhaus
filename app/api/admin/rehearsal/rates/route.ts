import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { getRehearsalSettings, updateRateCard, validateRateCard } from '@/lib/rehearsal/settings';

// The informal rate card: display-only (shown on /rehearsal, in the invite,
// and as soft estimates). Never stored on a booking as owed.

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const result = validateRateCard(await request.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  await updateRateCard(result.value);
  const s = await getRehearsalSettings();
  return NextResponse.json({
    rateHourlyCents: s.rateHourlyCents,
    ratePackages: s.ratePackages,
    rateRegularText: s.rateRegularText,
    rateFlexibleText: s.rateFlexibleText,
    estimatesEnabled: s.estimatesEnabled,
  });
}
