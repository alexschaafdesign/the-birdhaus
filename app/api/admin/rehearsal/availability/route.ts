import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { loadAvailability } from '@/lib/rehearsal/availability-data';
import { getRehearsalSettings, maskFeedUrl } from '@/lib/rehearsal/settings';

export const dynamic = 'force-dynamic';

// Admin view of availability: hours open vs taken out (by reason) through the
// window, each day's free stretches, plus each calendar feed's status (masked
// URL, ok/error, busy count; never titles).
// ?refresh=1 skips the 15-minute calendar cache.

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';

  const [{ availability, feeds }, settings] = await Promise.all([
    loadAvailability({ forceCalendar: refresh }),
    getRehearsalSettings(),
  ]);

  // Hours, rounded. Taken-out spans can overlap (a show on a busy evening),
  // so reasons may add up to more than the window.
  const ms: Record<string, number> = {};
  for (const d of availability.days) {
    for (const f of d.free) ms.open = (ms.open ?? 0) + (f.end.getTime() - f.start.getTime());
    for (const b of d.blocked) ms[b.reason] = (ms[b.reason] ?? 0) + (b.end.getTime() - b.start.getTime());
  }
  const counts = Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v / 3_600_000)]));

  return NextResponse.json({
    calendarChecked: availability.calendarChecked,
    windowStart: availability.windowStart,
    windowEnd: availability.windowEnd,
    counts,
    feeds: feeds.map((f) => ({ ...f, feed: maskFeedUrl(settings.icsFeedUrls[f.index] ?? '') })),
    days: availability.days.map((d) => ({ date: d.date, free: d.free })),
  });
}
