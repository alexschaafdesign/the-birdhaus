import { NextResponse } from 'next/server';
import { deleteRsvp } from '@/lib/rsvps';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rsvpId = parseId(id);
  if (rsvpId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = await deleteRsvp(rsvpId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
