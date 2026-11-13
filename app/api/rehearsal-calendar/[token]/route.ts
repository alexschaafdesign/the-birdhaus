import { buildRehearsalFeed, isLiveRehearsalFeedToken } from '@/lib/rehearsal/feed';

export const dynamic = 'force-dynamic';

// Alex's subscribed feed of confirmed rehearsals. No session (calendar apps
// can't log in): the secret token in the path is the credential. Unknown or
// revoked tokens get a bare 404.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isLiveRehearsalFeedToken(token.replace(/\.ics$/, '')))) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(await buildRehearsalFeed(), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="birdhaus-rehearsals.ics"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
