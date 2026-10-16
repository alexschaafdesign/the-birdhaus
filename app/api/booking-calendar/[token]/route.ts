import { getTodayCentral } from '@/lib/shows';
import { buildBookingFeed, isLiveFeedToken } from '@/lib/booking-feed';

export const dynamic = 'force-dynamic';

// Subscribed calendar feed (webcal). No session — calendar apps can't log
// in — so the secret token in the path is the credential; see
// lib/booking-feed.ts. Unknown or revoked tokens get a bare 404.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bare = token.replace(/\.ics$/, '');
  if (!(await isLiveFeedToken(bare))) {
    return new Response('Not found', { status: 404 });
  }
  const body = await buildBookingFeed(getTodayCentral());
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="birdhaus-booking.ics"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
