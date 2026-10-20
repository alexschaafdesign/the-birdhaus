import { NextResponse } from 'next/server';
import { logBlocked, outboundAllowed } from '@/lib/staging';

// Where the contact form posts off the production site (lib/staging.ts). Logs
// that a submission happened — field lengths only, never the contents — and
// sends nothing anywhere. 404 on production, where the form posts to the
// venue's Apps Script instead.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (outboundAllowed(request.headers.get('host'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const form = new URLSearchParams(await request.text());
  logBlocked('contact form', {
    action: form.get('action'),
    nameChars: (form.get('name') ?? '').length,
    emailChars: (form.get('email') ?? '').length,
    messageChars: (form.get('message') ?? '').length,
  });
  return new NextResponse(null, { status: 204 });
}
