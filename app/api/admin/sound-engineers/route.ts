import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Name typeahead for the show form's sound-engineer fields. Hit on every
// keystroke, so keep it cheap (mirrors the bands search route).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json([]);
  }

  const rows = await sql<Array<{ id: number; name: string }>>`
    select id, name
    from sound_engineers
    where name ilike ${'%' + q + '%'}
    order by name asc
    limit 8
  `;
  return NextResponse.json(rows.map((r) => ({ id: Number(r.id), name: r.name })));
}
