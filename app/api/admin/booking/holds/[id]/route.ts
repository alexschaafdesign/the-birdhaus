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

// Renumber a date's pending holds to 1..N (current position order), so the
// ladder never has gaps after a release/delete/reorder.
async function resequence(tx: Tx, date: string) {
  await tx`
    update date_holds
    set position = ranked.new_position
    from (
      select id, row_number() over (order by position asc, updated_at asc) as new_position
      from date_holds
      where date = ${date} and status = 'pending'
    ) ranked
    where date_holds.id = ranked.id and date_holds.position is distinct from ranked.new_position
  `;
}

// Every mutation responds with the date's full ladder so the client can
// replace that date's slice wholesale instead of guessing new positions.
async function holdsForDate(tx: Tx, date: string): Promise<DateHold[]> {
  return tx<DateHold[]>`
    select id, date::text as date, prospect_id, position, status, note, show_id, created_at, updated_at
    from date_holds
    where date = ${date}
    order by position asc, updated_at asc
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
  const hasPosition = 'position' in body;
  const hasNote = 'note' in body;
  const hasShowId = 'show_id' in body;

  if (hasStatus && !HOLD_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const targetPosition = hasPosition ? Number(body.position) : null;
  if (hasPosition && (!Number.isInteger(targetPosition) || (targetPosition as number) < 1)) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
  }
  if (hasNote && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Invalid note' }, { status: 400 });
  }
  const showId = hasShowId && body.show_id != null ? Number(body.show_id) : null;
  if (hasShowId && body.show_id != null && !Number.isInteger(showId)) {
    return NextResponse.json({ error: 'Invalid show_id' }, { status: 400 });
  }
  if (!hasStatus && !hasPosition && !hasNote && !hasShowId) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const result = await sql.begin(async (tx) => {
    const [hold] = await tx`
      select id, date::text as date, status from date_holds where id = ${holdId} for update
    `;
    if (!hold) return null;

    if (hasNote || hasShowId) {
      const note = hasNote ? (typeof body.note === 'string' ? body.note.trim() || null : null) : undefined;
      await tx`
        update date_holds
        set note = ${hasNote ? note : sql`note`},
            show_id = ${hasShowId ? showId : sql`show_id`},
            updated_at = now()
        where id = ${holdId}
      `;
    }

    if (hasStatus && body.status !== hold.status) {
      await tx`
        update date_holds set status = ${body.status}, updated_at = now() where id = ${holdId}
      `;
      if (body.status === 'confirmed') {
        // A confirmed night moots the rest of the ladder: siblings still
        // pending are auto-released (kept as history on their prospects),
        // and the confirmed prospect's pipeline status becomes 'booked'.
        await tx`
          update date_holds
          set status = 'released', updated_at = now()
          where date = ${hold.date} and status = 'pending' and id <> ${holdId}
        `;
        await tx`
          update booking_prospects
          set status = 'booked', updated_at = now()
          where id = (select prospect_id from date_holds where id = ${holdId})
        `;
      }
    } else if (hasPosition && hold.status === 'pending') {
      // Move within the pending ladder: shift the target up to make room,
      // then resequence to close any gap left behind.
      await tx`
        update date_holds
        set position = position + 1, updated_at = now()
        where date = ${hold.date} and status = 'pending' and id <> ${holdId}
          and position >= ${targetPosition}
      `;
      await tx`
        update date_holds set position = ${targetPosition}, updated_at = now() where id = ${holdId}
      `;
    }

    await resequence(tx, hold.date);
    return { holds: await holdsForDate(tx, hold.date) };
  });

  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(result);
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
    await resequence(tx, hold.date);
    return { holds: await holdsForDate(tx, hold.date) };
  });

  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(result);
}
