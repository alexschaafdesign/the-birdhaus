import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAllCards } from '@/lib/tv-program';
import { requireAdmin } from '@/lib/admin-session';

// Announcement cards for 'cards' mode (070_tv_program.sql). Auth is enforced
// centrally in proxy.ts for all /api/admin/* routes. Scope: ?showId=N / a
// showId body field targets that show's cards; absent = global (show_id null).

function nullableTrim(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}
function scopeShowId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const showId = scopeShowId(new URL(request.url).searchParams.get('showId'));
  return NextResponse.json(await getAllCards(showId));
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const headline = typeof body?.headline === 'string' ? body.headline.trim() : '';
  if (!headline) {
    return NextResponse.json({ error: 'Headline is required' }, { status: 400 });
  }
  const showId = scopeShowId(body?.showId);
  const [{ next }] = await sql<Array<{ next: number }>>`
    select coalesce(max(sort), 0) + 1 as next from tv_cards where show_id is not distinct from ${showId}
  `;
  const [row] = await sql<Array<{ id: number }>>`
    insert into tv_cards (show_id, headline, subtext, image, sort)
    values (${showId}, ${headline}, ${nullableTrim(body?.subtext)}, ${nullableTrim(body?.image)}, ${next})
    returning id
  `;
  return NextResponse.json({ id: Number(row.id) }, { status: 201 });
}
