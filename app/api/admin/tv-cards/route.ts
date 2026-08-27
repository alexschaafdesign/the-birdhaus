import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAllGlobalCards } from '@/lib/tv-program';

// Global announcement cards for 'cards' mode (070_tv_program.sql). Auth is
// enforced centrally in proxy.ts for all /api/admin/* routes. Phase 1 manages
// global cards (show_id null); per-show cards come in phase 2.

function nullableTrim(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

export async function GET() {
  return NextResponse.json(await getAllGlobalCards());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const headline = typeof body?.headline === 'string' ? body.headline.trim() : '';
  if (!headline) {
    return NextResponse.json({ error: 'Headline is required' }, { status: 400 });
  }
  const [{ next }] = await sql<Array<{ next: number }>>`
    select coalesce(max(sort), 0) + 1 as next from tv_cards where show_id is null
  `;
  const [row] = await sql<Array<{ id: number }>>`
    insert into tv_cards (show_id, headline, subtext, image, sort)
    values (null, ${headline}, ${nullableTrim(body?.subtext)}, ${nullableTrim(body?.image)}, ${next})
    returning id
  `;
  return NextResponse.json({ id: Number(row.id) }, { status: 201 });
}
