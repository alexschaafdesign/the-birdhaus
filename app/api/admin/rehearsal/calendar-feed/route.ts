import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { getOrCreateRehearsalFeedToken, rehearsalFeedUrl, resetRehearsalFeedToken } from '@/lib/rehearsal/feed';

// GET: the feed URL (minted on first use). POST: reset it (old URL stops).
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ url: rehearsalFeedUrl(await getOrCreateRehearsalFeedToken()) });
}

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ url: rehearsalFeedUrl(await resetRehearsalFeedToken()) });
}
