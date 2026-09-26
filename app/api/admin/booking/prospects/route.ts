import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { PROSPECT_STATUSES } from '@/lib/booking';
import { requireAdmin } from '@/lib/admin-session';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = await sql`
    select id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
    from booking_prospects
    order by priority desc, updated_at desc
  `;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const bandId = body?.band_id == null ? null : Number(body.band_id);
  const status = typeof body?.status === 'string' ? body.status : 'idea';
  const priority = body?.priority == null ? 0 : Number(body.priority);
  const notes = typeof body?.notes === 'string' ? body.notes : '';

  if (
    !name ||
    name.length > 120 ||
    (bandId !== null && !Number.isInteger(bandId)) ||
    !PROSPECT_STATUSES.includes(status) ||
    !Number.isInteger(priority)
  ) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const [row] = await sql`
    insert into booking_prospects (band_id, name, status, priority, notes)
    values (${bandId}, ${name}, ${status}, ${priority}, ${notes})
    returning id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
  `;

  return NextResponse.json(row, { status: 201 });
}
