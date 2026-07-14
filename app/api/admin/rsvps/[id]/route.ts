import { NextResponse } from 'next/server';
import { deleteRsvp, updateRsvp } from '@/lib/rsvps';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rsvpId = parseId(id);
  if (rsvpId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const name = nullableTrim(body?.name);
  const email = nullableTrim(body?.email);
  if (!name || !email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Name and a valid email are required' }, { status: 400 });
  }

  const guestsInput = Number.parseInt(String(body?.guests), 10);
  const guests = Number.isInteger(guestsInput) && guestsInput > 0 ? guestsInput : 1;
  const emailListOptIn = body?.emailListOptIn === true;

  const rsvp = await updateRsvp(rsvpId, { name, email, guests, emailListOptIn });
  if (!rsvp) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(rsvp);
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
