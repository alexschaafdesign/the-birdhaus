import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const noteId = parseId(id);
  if (noteId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const noteBody = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!noteBody || noteBody.length > 2000) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const [row] = await sql`
    update date_notes
    set body = ${noteBody}, updated_at = now()
    where id = ${noteId}
    returning id, date::text as date, body, created_at, updated_at
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
  const noteId = parseId(id);
  if (noteId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from date_notes where id = ${noteId}`;
  return NextResponse.json({ ok: true });
}
