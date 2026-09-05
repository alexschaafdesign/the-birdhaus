import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAvailableDates } from '@/lib/available-dates';
import { requireAdmin } from '@/lib/admin-session';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = await getAvailableDates();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  if (!ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const [row] = await sql`
    insert into available_dates (date) values (${date})
    on conflict (date) do nothing
    returning id, date::text as date, created_at
  `;

  if (!row) {
    return NextResponse.json({ error: 'That date is already on the list' }, { status: 409 });
  }
  return NextResponse.json(row, { status: 201 });
}
