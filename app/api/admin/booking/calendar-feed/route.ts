import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { feedUrl, resetFeedToken } from '@/lib/booking-feed';

// Revokes the current subscription URL and issues a new one. Calendars
// subscribed to the old URL stop updating until re-subscribed.
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const token = await resetFeedToken();
  return NextResponse.json({ url: feedUrl(token) });
}
