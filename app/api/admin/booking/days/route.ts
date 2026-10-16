import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Saves one day's title + notepad (the day panel autosaves while typing).
// Both empty clears the row so blank days don't linger.
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : null;
  const notepad = typeof body?.notepad === 'string' ? body.notepad.replace(/\s+$/, '') : null;

  if (!ISO_DATE_RE.test(date) || title === null || notepad === null || title.length > 120 || notepad.length > 10000) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  if (!title && !notepad) {
    await sql`delete from booking_days where date = ${date}`;
    return NextResponse.json({ date, title: '', notepad: '' });
  }

  const [row] = await sql`
    insert into booking_days (date, title, notepad)
    values (${date}, ${title}, ${notepad})
    on conflict (date) do update
      set title = excluded.title, notepad = excluded.notepad, updated_at = now()
    returning date::text as date, title, notepad
  `;
  return NextResponse.json(row);
}
