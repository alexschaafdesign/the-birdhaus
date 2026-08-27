import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

// Edit an image: caption, active flag, or reorder one step. `move: 'up'|'down'`
// swaps display order with the adjacent image (sort asc, id asc) — a no-op at
// the ends. caption/active update in place.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imageId = parseId(id);
  if (imageId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (body.move === 'up' || body.move === 'down') {
    const [current] = await sql<Array<{ id: number; sort: number }>>`
      select id, sort from tv_images where id = ${imageId}
    `;
    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // The neighbor on the requested side, in the same (sort, id) order the
    // list is displayed in — so ties on `sort` still move deterministically.
    const [neighbor] =
      body.move === 'up'
        ? await sql<Array<{ id: number; sort: number }>>`
            select id, sort from tv_images
            where (sort, id) < (${current.sort}, ${current.id})
            order by sort desc, id desc
            limit 1
          `
        : await sql<Array<{ id: number; sort: number }>>`
            select id, sort from tv_images
            where (sort, id) > (${current.sort}, ${current.id})
            order by sort asc, id asc
            limit 1
          `;
    if (!neighbor) {
      // Already at the end in that direction — nothing to do.
      return NextResponse.json({ ok: true });
    }
    // Swap sort values. If they were equal (legacy ties), nudge so the swap
    // actually reorders rather than staying a tie.
    const a = current.sort;
    const b = neighbor.sort === a ? (body.move === 'up' ? a - 1 : a + 1) : neighbor.sort;
    await sql`
      update tv_images set sort = case
        when id = ${current.id} then ${b}::int
        when id = ${neighbor.id} then ${a}::int
      end, updated_at = now()
      where id in (${current.id}, ${neighbor.id})
    `;
    return NextResponse.json({ ok: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = [];
  if ('caption' in body) {
    const caption =
      typeof body.caption === 'string' ? body.caption.trim() || null : null;
    assignments.push(sql`caption = ${caption}`);
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
    update tv_images
    set ${setClause}, updated_at = now()
    where id = ${imageId}
    returning id
  `;
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imageId = parseId(id);
  if (imageId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  // The R2 object is left in place (cheap, immutable, content-addressed) — only
  // the pool entry is removed, same as other admin deletes in this codebase.
  await sql`delete from tv_images where id = ${imageId}`;
  return NextResponse.json({ ok: true });
}
