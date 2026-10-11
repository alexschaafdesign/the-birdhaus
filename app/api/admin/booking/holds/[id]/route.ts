import { NextResponse } from 'next/server';
import type postgres from 'postgres';
import { sql } from '@/lib/db';
import type { DateHold } from '@/lib/booking';
import { HOLD_STATUSES } from '@/lib/booking';
import { requireAdmin } from '@/lib/admin-session';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

type Tx = postgres.TransactionSql;

// Every mutation responds with the date's full asked list so the client can
// replace that date's slice wholesale.
async function holdsForDate(tx: Tx, date: string): Promise<DateHold[]> {
  return tx<DateHold[]>`
    select id, date::text as date, prospect_id, position, status, note, show_id, created_at, updated_at
    from date_holds
    where date = ${date}
    order by created_at asc
  `;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const holdId = parseId(id);
  if (holdId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const hasStatus = 'status' in body;
  const hasNote = 'note' in body;
  const hasShowId = 'show_id' in body;

  if (hasStatus && !HOLD_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  if (hasNote && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Invalid note' }, { status: 400 });
  }
  const showId = hasShowId && body.show_id != null ? Number(body.show_id) : null;
  if (hasShowId && body.show_id != null && !Number.isInteger(showId)) {
    return NextResponse.json({ error: 'Invalid show_id' }, { status: 400 });
  }
  if (!hasStatus && !hasNote && !hasShowId) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const result = await sql.begin(async (tx) => {
      const [hold] = await tx`
        select id, date::text as date, prospect_id, status from date_holds where id = ${holdId} for update
      `;
      if (!hold) return null;

      const note = hasNote ? (typeof body.note === 'string' ? body.note.trim() || null : null) : null;
      await tx`
        update date_holds
        set status = ${hasStatus ? body.status : sql`status`},
            note = ${hasNote ? note : sql`note`},
            show_id = ${hasShowId ? showId : sql`show_id`},
            updated_at = now()
        where id = ${holdId}
      `;

      // A hold or booking on a night moves the band's overall pipeline status
      // forward (never back): hold lifts early stages to 'hold', booked sets
      // 'booked'. Passing on one date says nothing about the band overall.
      let prospect = null;
      if (hasStatus && body.status !== hold.status && (body.status === 'hold' || body.status === 'booked')) {
        [prospect] = await tx`
          update booking_prospects
          set status = case
                when ${body.status}::text = 'booked' then 'booked'
                when status in ('idea', 'contacted', 'in_talks') then 'hold'
                else status
              end,
              updated_at = now()
          where id = ${hold.prospect_id}
          returning id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
        `;
      }

      return { holds: await holdsForDate(tx, hold.date), prospect: prospect ?? null };
    });

    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    // Reviving a passed ask while the band already has a live one that night.
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'Band already has a live ask on this date' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const holdId = parseId(id);
  if (holdId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const result = await sql.begin(async (tx) => {
    const [hold] = await tx`
      delete from date_holds where id = ${holdId} returning date::text as date
    `;
    if (!hold) return null;
    return { holds: await holdsForDate(tx, hold.date) };
  });

  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(result);
}
