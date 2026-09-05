import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-session';

// Name typeahead for the show form's sound-engineer fields. Hit on every
// keystroke, so keep it cheap (mirrors the bands search route).
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json([]);
  }

  const rows = await sql<Array<{ id: number; name: string }>>`
    select id, name
    from sound_engineers
    where name ilike ${'%' + q + '%'}
    order by name asc
    limit 8
  `;
  return NextResponse.json(rows.map((r) => ({ id: Number(r.id), name: r.name })));
}

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

// Create a sound engineer profile from the admin section. Name is unique
// case-insensitively (sound_engineers_name_idx) — a collision returns 409.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = nullableTrim(body?.name);
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const [row] = await sql<Array<{ id: number }>>`
      insert into sound_engineers (name, photo, bio, instagram, contact_email, payment_method)
      values (
        ${name}, ${nullableTrim(body.photo)}, ${nullableTrim(body.bio)},
        ${nullableTrim(body.instagram)}, ${nullableTrim(body.contactEmail)}, ${nullableTrim(body.paymentMethod)}
      )
      returning id
    `;
    return NextResponse.json({ id: Number(row.id) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A sound engineer with this name already exists' }, { status: 409 });
    }
    throw error;
  }
}
