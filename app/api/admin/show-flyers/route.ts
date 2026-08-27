import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Shows that have a flyer, for the screensaver flyer picker. Auth is enforced
// centrally in proxy.ts for all /api/admin/* routes. Returns the public flyer
// URL as-is (the TV feed rewrites it to a 640px variant when it's shown).
export async function GET() {
  const rows = await sql<Array<{ id: number; title: string; date: string; flyer: string }>>`
    select id, title, date::text as date, flyer
    from shows
    where flyer is not null and flyer <> ''
    order by date desc
    limit 300
  `;
  return NextResponse.json(
    rows.map((r) => ({ id: Number(r.id), title: r.title, date: r.date, flyer: r.flyer }))
  );
}
