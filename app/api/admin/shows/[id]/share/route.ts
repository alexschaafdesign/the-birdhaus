import { NextResponse } from 'next/server';
import { getOrCreateShareToken, regenerateShareToken } from '@/lib/share-token';
import { SITE_URL } from '@/lib/site';
import { requireAdmin } from '@/lib/admin-session';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

function urlFor(token: string): string {
  return `${SITE_URL}/hub/${token}`;
}

// Current share link (generating one on first use).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const token = await getOrCreateShareToken(showId);
  if (!token) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  return NextResponse.json({ url: urlFor(token) });
}

// Rotate the token — the old link stops working.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const token = await regenerateShareToken(showId);
  if (!token) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  return NextResponse.json({ url: urlFor(token) });
}
