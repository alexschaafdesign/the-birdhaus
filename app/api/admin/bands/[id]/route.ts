import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { BAND_COLUMNS, slugify } from '@/lib/bands';
import { requireAdmin } from '@/lib/admin-session';

const TEXT_FIELD_MAP: Record<string, string> = {
  name: 'name',
  instagram: 'instagram',
  bio: 'bio',
  photo: 'photo',
  // Band contact email, reused for advance emails. Private, admin-only.
  contactEmail: 'contact_email',
  // Private payment handle (Venmo, etc.) for paying the band out. Admin-only.
  paymentMethod: 'payment_method',
  // Twin Scene page slug, set by "Prefill from Twin Scene" — only used to link
  // to the band's Twin Scene page and stage plot.
  twinsceneSlug: 'twinscene_slug',
};

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

// The band form's fields, for the show form's band modal to pre-fill from.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const bandId = parseId(id);
  if (bandId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const [row] = await sql`
    select id, name, instagram, bio, photo, is_touring, hometown, contact_email, payment_method, twinscene_slug
    from bands where id = ${bandId}
  `;
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const bandId = parseId(id);
  if (bandId === null) {
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

  if ('slug' in body) {
    const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
    if (!slug) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }
    assignments.push(sql`slug = ${slug}`);
  }

  if ('isTouring' in body) {
    assignments.push(sql`is_touring = ${Boolean(body.isTouring)}`);
  }

  if ('hometown' in body) {
    // Only meaningful when touring — if this request also sets isTouring to
    // false, drop any hometown value rather than storing a stale one.
    const isTouring = 'isTouring' in body ? Boolean(body.isTouring) : undefined;
    const trimmed = typeof body.hometown === 'string' ? body.hometown.trim() || null : null;
    assignments.push(sql`hometown = ${isTouring === false ? null : trimmed}`);
  }

  if (assignments.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const setClause = assignments.reduce(
    (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
    null
  );

  try {
    const [row] = await sql`
      update bands
      set ${setClause}, updated_at = now()
      where id = ${bandId}
      returning ${sql(BAND_COLUMNS)}
    `;

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Band pages, and show pages (which embed each band's bio/photo), are
    // statically generated with no revalidate window.
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/shows/[id]', 'page');
    revalidatePath('/bands');
    revalidatePath('/');

    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A band with this slug already exists' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const bandId = parseId(id);
  if (bandId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from bands where id = ${bandId}`;
  revalidatePath('/bands/[slug]', 'page');
  revalidatePath('/shows/[id]', 'page');
  revalidatePath('/bands');
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
