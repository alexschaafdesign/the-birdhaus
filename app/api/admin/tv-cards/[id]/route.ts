import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

// Edit a card: headline / subtext / image / active, or reorder one step within
// the global set. `move: 'up'|'down'` swaps display order with the neighbor.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const cardId = parseId(id);
  if (cardId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (body.move === 'up' || body.move === 'down') {
    const [current] = await sql<Array<{ id: number; sort: number; show_id: number | null }>>`
      select id, sort, show_id from tv_cards where id = ${cardId}
    `;
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Reorder within the card's own scope (global cards among global, a show's
    // cards among that show's).
    const [neighbor] =
      body.move === 'up'
        ? await sql<Array<{ id: number; sort: number }>>`
            select id, sort from tv_cards
            where show_id is not distinct from ${current.show_id}
              and (sort, id) < (${current.sort}, ${current.id})
            order by sort desc, id desc limit 1
          `
        : await sql<Array<{ id: number; sort: number }>>`
            select id, sort from tv_cards
            where show_id is not distinct from ${current.show_id}
              and (sort, id) > (${current.sort}, ${current.id})
            order by sort asc, id asc limit 1
          `;
    if (!neighbor) return NextResponse.json({ ok: true });
    const a = current.sort;
    const b = neighbor.sort === a ? (body.move === 'up' ? a - 1 : a + 1) : neighbor.sort;
    await sql`
      update tv_cards set sort = case
        when id = ${current.id} then ${b}::int
        when id = ${neighbor.id} then ${a}::int
      end, updated_at = now()
      where id in (${current.id}, ${neighbor.id})
    `;
    return NextResponse.json({ ok: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = [];
  if ('headline' in body) {
    const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
    if (!headline) return NextResponse.json({ error: 'Headline cannot be empty' }, { status: 400 });
    assignments.push(sql`headline = ${headline}`);
  }
  if ('subtext' in body) {
    const subtext = typeof body.subtext === 'string' ? body.subtext.trim() || null : null;
    assignments.push(sql`subtext = ${subtext}`);
  }
  if ('image' in body) {
    const image = typeof body.image === 'string' ? body.image.trim() || null : null;
    assignments.push(sql`image = ${image}`);
  }
  if ('active' in body) {
    assignments.push(sql`active = ${!!body.active}`);
  }
  if (assignments.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const setClause = assignments.reduce(
    (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
    null
  );
  const [row] = await sql<Array<{ id: number }>>`
    update tv_cards set ${setClause}, updated_at = now()
    where id = ${cardId}
    returning id
  `;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const cardId = parseId(id);
  if (cardId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  await sql`delete from tv_cards where id = ${cardId}`;
  return NextResponse.json({ ok: true });
}
