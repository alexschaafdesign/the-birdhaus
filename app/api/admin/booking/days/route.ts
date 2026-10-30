import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Saves one day's title + notepad + not-available flag (the day panel
// autosaves while typing). All empty clears the row so blank days don't
// linger. Marking a day not available also drops it from available_dates —
// a night can't be both.
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : null;
  const notepad = typeof body?.notepad === 'string' ? body.notepad.replace(/\s+$/, '') : null;
  const unavailable = body?.unavailable === undefined ? false : body.unavailable;

  if (
    !ISO_DATE_RE.test(date) ||
    title === null ||
    notepad === null ||
    typeof unavailable !== 'boolean' ||
    title.length > 120 ||
    notepad.length > 10000
  ) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  if (!title && !notepad && !unavailable) {
    await sql`delete from booking_days where date = ${date}`;
    return NextResponse.json({ date, title: '', notepad: '', unavailable: false });
  }

  const row = await sql.begin(async (tx) => {
    if (unavailable) await tx`delete from available_dates where date = ${date}`;
    const [saved] = await tx`
      insert into booking_days (date, title, notepad, unavailable)
      values (${date}, ${title}, ${notepad}, ${unavailable})
      on conflict (date) do update
        set title = excluded.title, notepad = excluded.notepad,
            unavailable = excluded.unavailable, updated_at = now()
      returning date::text as date, title, notepad, unavailable
    `;
    return saved;
  });
  return NextResponse.json(row);
}
