import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = await sql`
    select id, date::text as date, prospect_id, position, status, note, show_id, created_at, updated_at
    from date_holds
    order by date asc, position asc
  `;
  return NextResponse.json(rows);
}

// Adds a hold at the bottom of the date's ladder (H{n+1}). Also nudges the
// prospect's pipeline status forward to 'hold' — forward only, so a prospect
// already booked/passed keeps that status.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const prospectId = Number(body?.prospect_id);
  const date = typeof body?.date === 'string' ? body.date : '';
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;

  if (!Number.isInteger(prospectId) || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const result = await sql.begin(async (tx) => {
      const [hold] = await tx`
        insert into date_holds (date, prospect_id, position, note)
        values (
          ${date},
          ${prospectId},
          (select coalesce(max(position), 0) + 1 from date_holds where date = ${date} and status = 'pending'),
          ${note}
        )
        returning id, date::text as date, prospect_id, position, status, note, show_id, created_at, updated_at
      `;
      const [prospect] = await tx`
        update booking_prospects
        set status = case when status in ('idea', 'contacted', 'in_talks') then 'hold' else status end,
            updated_at = now()
        where id = ${prospectId}
        returning id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
      `;
      return { hold, prospect };
    });

    if (!result.prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError?.code === '23505') {
      return NextResponse.json({ error: 'Prospect already holds this date' }, { status: 409 });
    }
    if (pgError?.code === '23503') {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }
    throw error;
  }
}
