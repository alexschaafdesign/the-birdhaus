import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { loadAvailability } from '@/lib/rehearsal/availability-data';
import { getRehearsalSettings, maskFeedUrl } from '@/lib/rehearsal/settings';

export const dynamic = 'force-dynamic';

// Admin view of availability: every block with its reasons, plus each
// calendar feed's status (masked URL, ok/error, busy count; never titles).
// ?refresh=1 skips the 15-minute calendar cache.

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';

  const [{ availability, feeds }, settings] = await Promise.all([
    loadAvailability({ forceCalendar: refresh }),
    getRehearsalSettings(),
  ]);

  const counts: Record<string, number> = {};
  for (const b of availability.blocks) {
    const key = b.state === 'unavailable' ? b.reasons[0] : b.state;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return NextResponse.json({
    calendarChecked: availability.calendarChecked,
    windowStart: availability.windowStart,
    windowEnd: availability.windowEnd,
    counts,
    feeds: feeds.map((f) => ({ ...f, feed: maskFeedUrl(settings.icsFeedUrls[f.index] ?? '') })),
    blocks: availability.blocks,
  });
}
