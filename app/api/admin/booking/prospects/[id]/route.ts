import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { PROSPECT_STATUSES } from '@/lib/booking';
import { requireAdmin } from '@/lib/admin-session';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const prospectId = parseId(id);
  if (prospectId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const updates: Record<string, string | number | null> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > 120) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }
    updates.name = name;
  }
  if ('band_id' in body) {
    const bandId = body.band_id == null ? null : Number(body.band_id);
    if (bandId !== null && !Number.isInteger(bandId)) {
      return NextResponse.json({ error: 'Invalid band_id' }, { status: 400 });
    }
    updates.band_id = bandId;
  }
  if ('status' in body) {
    if (!PROSPECT_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if ('priority' in body) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }
    updates.priority = priority;
  }
  if ('notes' in body) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });
    }
    updates.notes = body.notes;
  }
  // One-tap "logged contact today" shortcut.
  if (body.touch_contacted === true) {
    updates.last_contacted_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [row] = await sql`
    update booking_prospects
    set ${sql(updates)}, updated_at = now()
    where id = ${prospectId}
    returning id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
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
  const prospectId = parseId(id);
  if (prospectId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from booking_prospects where id = ${prospectId}`;
  return NextResponse.json({ ok: true });
}
