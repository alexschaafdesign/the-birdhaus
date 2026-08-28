import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  deleteRsvp,
  setRsvpArrived,
  setRsvpBuyerEmail,
  setRsvpCreditedTickets,
  setRsvpPaid,
  updateRsvp,
} from '@/lib/rsvps';

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

  // Door-list toggles: a body with just { arrived } or { paid } flips that one
  // flag without touching the rest of the row (skips the name/email edit path).
  if (typeof body?.arrived === 'boolean') {
    const rsvp = await setRsvpArrived(rsvpId, body.arrived);
    if (!rsvp) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rsvp);
  }
  if (typeof body?.paid === 'boolean') {
    const rsvp = await setRsvpPaid(rsvpId, body.paid);
    if (!rsvp) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rsvp);
  }

  // Manual attendance credit: { creditedTickets } counts this person as N heads
  // toward the ticket cap regardless of what they bought ({ creditedTickets: null }
  // clears it). Touches only this column.
  if ('creditedTickets' in (body ?? {})) {
    const raw = body?.creditedTickets;
    let credited: number | null;
    if (raw === null) {
      credited = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'Invalid creditedTickets' }, { status: 400 });
      }
      credited = n;
    }
    const rsvp = await setRsvpCreditedTickets(rsvpId, credited);
    if (!rsvp) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // A credit can push a show over (or back under) its cap — regenerate the
    // static show pages so the sold-out notice reflects it.
    revalidatePath('/shows/[slug]', 'page');
    return NextResponse.json(rsvp);
  }

  // Manual purchase match: { buyerEmail } links a Square buyer address to this
  // RSVP ({ buyerEmail: null } unlinks it) without touching the other fields.
  if ('buyerEmail' in (body ?? {})) {
    const buyerEmail = nullableTrim(body?.buyerEmail);
    if (body?.buyerEmail !== null && (!buyerEmail || !EMAIL_REGEX.test(buyerEmail))) {
      return NextResponse.json({ error: 'A valid buyer email is required' }, { status: 400 });
    }
    const rsvp = await setRsvpBuyerEmail(rsvpId, buyerEmail);
    if (!rsvp) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rsvp);
  }

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
