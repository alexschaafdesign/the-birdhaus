import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { bookingUrl, replaceBandLink, revokeBandLink } from '@/lib/rehearsal/bands';

// POST = replace the band's link (the old one stops working); DELETE = revoke it.

function bandId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = bandId((await params).id);
  if (!id) return NextResponse.json({ error: 'Bad band id' }, { status: 400 });
  const token = await replaceBandLink(id);
  if (!token) return NextResponse.json({ error: 'Band not found' }, { status: 404 });
  return NextResponse.json({ url: bookingUrl(token) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = bandId((await params).id);
  if (!id) return NextResponse.json({ error: 'Bad band id' }, { status: 400 });
  await revokeBandLink(id);
  return NextResponse.json({ ok: true });
}
