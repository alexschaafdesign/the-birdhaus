import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { slugify } from '@/lib/bands';

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q');

  if (q && q.trim()) {
    // Typeahead path — hit on every keystroke from ShowForm, so keep this cheap
    // (no show-count subquery).
    const rows = await sql`
      select id, slug, name, instagram, bio, photo, twin_scene_band_id
      from bands
      where name ilike ${'%' + q.trim() + '%'}
      order by name asc
      limit 8
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    select b.*,
      (select count(*)::int from show_bands sb where sb.band_id = b.id) as show_count
    from bands b
    order by b.name asc
  `;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const name = nullableTrim(body?.name);
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json({ error: 'Could not derive a slug from name' }, { status: 400 });
  }

  const isTouring = Boolean(body.isTouring);
  // Only meaningful when touring — never store a stale hometown on a local band.
  const hometown = isTouring ? nullableTrim(body.hometown) : null;

  try {
    const [row] = await sql`
      insert into bands (slug, name, instagram, bio, photo, is_touring, hometown, contact_email)
      values (
        ${slug}, ${name}, ${nullableTrim(body.instagram)}, ${nullableTrim(body.bio)}, ${nullableTrim(body.photo)},
        ${isTouring}, ${hometown}, ${nullableTrim(body.contactEmail)}
      )
      returning *
    `;
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/bands');
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A band with this name already exists' }, { status: 409 });
    }
    throw error;
  }
}
