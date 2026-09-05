import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { updateSoundEngineerEmail } from '@/lib/sound-engineers';
import { requireAdmin } from '@/lib/admin-session';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

// Editable profile fields → columns. `contact_email` is also reachable via the
// legacy `{ email }` shape below (see PATCH), which the Advance tab still sends.
const TEXT_FIELD_MAP: Record<string, string> = {
  name: 'name',
  photo: 'photo',
  bio: 'bio',
  instagram: 'instagram',
  contactEmail: 'contact_email',
  paymentMethod: 'payment_method',
};

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

// Update a sound engineer. Two shapes are accepted:
//   { email }                    — legacy, from the Advance tab (contact email only)
//   { name?, photo?, bio?, ... } — full profile edit, from the admin section
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const engineerId = parseId(id);
  if (engineerId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Legacy path: the Advance tab PATCHes just { email } to set the contact email.
  if ('email' in body && !('contactEmail' in body)) {
    await updateSoundEngineerEmail(engineerId, typeof body.email === 'string' ? body.email : '');
    return NextResponse.json({ ok: true });
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
      update sound_engineers
      set ${setClause}, updated_at = now()
      where id = ${engineerId}
      returning id
    `;
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A sound engineer with this name already exists' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const engineerId = parseId(id);
  if (engineerId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // show_sound_engineers references this with `on delete restrict`, so an
  // engineer still linked to a show can't be deleted — surface that clearly
  // instead of a 500.
  try {
    await sql`delete from sound_engineers where id = ${engineerId}`;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23503') {
      return NextResponse.json(
        { error: 'This engineer is still assigned to shows — remove them from those shows first.' },
        { status: 409 }
      );
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
