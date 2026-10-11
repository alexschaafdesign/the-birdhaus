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
    order by date asc, created_at asc
  `;
  return NextResponse.json(rows);
}

// Logs that a band was asked about a date. Takes either an existing
// prospect_id, or a band name (plus optional band_id from the directory
// autocomplete) — an unknown band becomes a prospect on the spot. Asking
// counts as contact (last_contacted_at is stamped) and brings a band marked
// not interested back; otherwise the band's standing derives from its dates.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const prospectIdInput = body?.prospect_id == null ? null : Number(body.prospect_id);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const bandId = body?.band_id == null ? null : Number(body.band_id);
  const date = typeof body?.date === 'string' ? body.date : '';
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;

  if (
    !ISO_DATE_RE.test(date) ||
    (prospectIdInput !== null && !Number.isInteger(prospectIdInput)) ||
    (prospectIdInput === null && (!name || name.length > 120)) ||
    (bandId !== null && !Number.isInteger(bandId))
  ) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const result = await sql.begin(async (tx) => {
      let prospectId = prospectIdInput;
      if (prospectId === null) {
        // Reuse a prospect already tracking this band — by directory link
        // first, then by name — so typing a known band doesn't duplicate it.
        const [existing] = await tx`
          select id from booking_prospects
          where (${bandId}::bigint is not null and band_id = ${bandId}::bigint)
             or lower(name) = lower(${name})
          order by (band_id is not distinct from ${bandId}::bigint) desc, id asc
          limit 1
        `;
        if (existing) {
          prospectId = Number(existing.id);
        } else {
          const [created] = await tx`
            insert into booking_prospects (band_id, name, status)
            values (${bandId}, ${name}, 'idea')
            returning id
          `;
          prospectId = Number(created.id);
        }
      }

      const [hold] = await tx`
        insert into date_holds (date, prospect_id, status, note)
        values (${date}, ${prospectId}, 'asked', ${note})
        returning id, date::text as date, prospect_id, position, status, note, show_id, created_at, updated_at
      `;
      const [prospect] = await tx`
        update booking_prospects
        set status = case when status = 'passed' then 'idea' else status end,
            last_contacted_at = now(),
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
      return NextResponse.json({ error: 'Already asked this band about this date' }, { status: 409 });
    }
    if (pgError?.code === '23503') {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }
    throw error;
  }
}
