import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import {
  getDayWindows,
  getRehearsalSettings,
  replaceDayWindows,
  updateBookingRules,
  validateBookingRules,
  validateDayWindows,
} from '@/lib/rehearsal/settings';

// Booking hours: each weekday's bookable window (an outer limit only), plus
// the start-time step, allowed lengths, min/max and the turnover buffer.
// PUT replaces both together.

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const windows = validateDayWindows(body?.windows);
  if (!windows.ok) return NextResponse.json({ error: windows.error }, { status: 400 });
  const rules = validateBookingRules(body?.rules);
  if (!rules.ok) return NextResponse.json({ error: rules.error }, { status: 400 });
  await updateBookingRules(rules.value);
  const saved = await replaceDayWindows(windows.value);
  const s = await getRehearsalSettings();
  return NextResponse.json({
    windows: saved,
    rules: {
      startStepMinutes: s.startStepMinutes,
      allowedLengths: s.allowedLengths,
      minMinutes: s.minMinutes,
      maxMinutes: s.maxMinutes,
      bufferMinutes: s.bufferMinutes,
    },
  });
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ windows: await getDayWindows() });
}
