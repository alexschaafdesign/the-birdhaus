import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { SUBMISSION_STATUSES, parseAvailability } from '@/lib/submissions';
import { requireAdmin } from '@/lib/admin-session';

const EDITABLE_TEXT_FIELDS = [
  'band_name',
  'contact_name',
  'email',
  'socials',
  'genre',
  'availability_text',
  'comments',
  'notes',
] as const;

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const submissionId = parseId(id);
  if (submissionId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Built as SQL fragments (rather than the sql(object, keys) helper) so the
  // availability column can be explicitly typed as jsonb via sql.json().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = [];

  for (const field of EDITABLE_TEXT_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    const trimmed = typeof value === 'string' ? value.trim() || null : null;
    if (field === 'band_name' && !trimmed) {
      return NextResponse.json({ error: 'Band name cannot be empty' }, { status: 400 });
    }
    assignments.push(sql`${sql(field)} = ${trimmed}`);
  }

  if ('status' in body) {
    if (!SUBMISSION_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    assignments.push(sql`status = ${body.status}`);
  }

  if ('availability' in body) {
    const availability = parseAvailability(body.availability);
    if (availability === null) {
      return NextResponse.json({ error: 'Invalid availability entries' }, { status: 400 });
    }
    assignments.push(sql`availability = ${sql.json(availability)}`);
  }

  if (assignments.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const setClause = assignments.reduce(
    (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
    null
  );

  const [row] = await sql`
    update submissions
    set ${setClause}, updated_at = now()
    where id = ${submissionId}
    returning *
  `;

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const submissionId = parseId(id);
  if (submissionId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from submissions where id = ${submissionId}`;
  return NextResponse.json({ ok: true });
}
