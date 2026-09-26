import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = await sql`
    select id, date::text as date, body, created_at, updated_at
    from date_notes
    order by date asc, created_at asc
  `;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  const noteBody = typeof body?.body === 'string' ? body.body.trim() : '';

  if (!ISO_DATE_RE.test(date) || !noteBody || noteBody.length > 2000) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const [row] = await sql`
    insert into date_notes (date, body)
    values (${date}, ${noteBody})
    returning id, date::text as date, body, created_at, updated_at
  `;

  return NextResponse.json(row, { status: 201 });
}
