import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { DATE_OFFER_STATUSES } from '@/lib/date-offers';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = parseId(id);
  if (offerId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!DATE_OFFER_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const [row] = await sql`
    update submission_date_offers
    set status = ${status}, updated_at = now()
    where id = ${offerId}
    returning id, submission_id, date::text as date, status, created_at, updated_at
  `;

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = parseId(id);
  if (offerId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from submission_date_offers where id = ${offerId}`;
  return NextResponse.json({ ok: true });
}
