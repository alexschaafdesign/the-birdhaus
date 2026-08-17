import { NextResponse } from 'next/server';
import { getMailchimpConfigStatus, pingMailchimp } from '@/lib/mailchimp';
import { isAdminSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// Monitors the Mailchimp RSVP-opt-in sync. RSVP opt-ins are fire-and-forget, so
// a missing/broken config drops people silently; this endpoint makes that state
// observable (point an uptime check at it — a 503 means opt-ins aren't syncing).
//
//   GET /api/health/mailchimp          → config presence only (no external call)
//   GET /api/health/mailchimp?live=1   → also pings Mailchimp (admin session only)
//
// Never returns the API key or audience id — only booleans + the datacenter
// suffix parsed from the key.
export async function GET(request: Request) {
  const status = getMailchimpConfigStatus();
  const wantLive = new URL(request.url).searchParams.get('live') === '1';

  const body: Record<string, unknown> = {
    ok: status.configured,
    configured: status.configured,
    apiKeyPresent: status.apiKeyPresent,
    audiencePresent: status.audiencePresent,
    datacenter: status.datacenter,
  };

  // The live probe makes a real outbound call, so gate it behind an admin
  // session to keep it from being an unauthenticated proxy to Mailchimp.
  if (wantLive) {
    if (!(await isAdminSession())) {
      return NextResponse.json({ error: 'Admin session required for ?live=1' }, { status: 401 });
    }
    const ping = await pingMailchimp();
    body.live = ping;
    body.ok = status.configured && ping.ok;
  }

  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
