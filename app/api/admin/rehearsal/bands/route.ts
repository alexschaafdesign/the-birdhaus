import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { bookingUrl, createBand, listBands, validateNewBand } from '@/lib/rehearsal/bands';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const bands = await listBands();
  return NextResponse.json({ bands: bands.map((b) => ({ ...b, url: b.token ? bookingUrl(b.token) : null })) });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = validateNewBand(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, token } = await createBand(parsed.value);
  return NextResponse.json({ id, url: bookingUrl(token) });
}
