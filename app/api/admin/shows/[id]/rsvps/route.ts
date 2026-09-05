import { NextResponse } from 'next/server';
import { createRsvp } from '@/lib/rsvps';
import { requireAdmin } from '@/lib/admin-session';

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
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

  try {
    const rsvp = await createRsvp({ showId, name, email, guests, emailListOptIn });
    return NextResponse.json(rsvp, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    throw error;
  }
}
