import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

const TEXT_FIELD_MAP: Record<string, string> = {
  name: 'name',
  photo: 'photo',
  bio: 'bio',
  instagram: 'instagram',
  contactEmail: 'contact_email',
};

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photographerId = parseId(id);
  if (photographerId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = [];
  for (const [clientField, column] of Object.entries(TEXT_FIELD_MAP)) {
    if (!(clientField in body)) continue;
    const value = body[clientField];
    const trimmed = typeof value === 'string' ? value.trim() || null : null;
    if (clientField === 'name' && !trimmed) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    assignments.push(sql`${sql(column)} = ${trimmed}`);
  }

  if (assignments.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const setClause = assignments.reduce(
    (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
    null
  );

  try {
    const [row] = await sql<Array<{ id: number }>>`
      update photographers
      set ${setClause}, updated_at = now()
      where id = ${photographerId}
      returning id
    `;
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A photographer with this name already exists' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photographerId = parseId(id);
  if (photographerId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  // Nothing references photographers by FK (settlements keep a free-text name),
  // so a delete just drops the profile.
  await sql`delete from photographers where id = ${photographerId}`;
  return NextResponse.json({ ok: true });
}
