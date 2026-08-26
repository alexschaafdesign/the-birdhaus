import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

// Name typeahead (mirrors the photographers route). Returns [] without a query.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json([]);
  }
  const rows = await sql<Array<{ id: number; name: string }>>`
    select id, name
    from door_persons
    where name ilike ${'%' + q + '%'}
    order by name asc
    limit 8
  `;
  return NextResponse.json(rows.map((r) => ({ id: Number(r.id), name: r.name })));
}

// Create a door-person profile. Name is unique case-insensitively — a collision
// returns 409.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = nullableTrim(body?.name);
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const [row] = await sql<Array<{ id: number }>>`
      insert into door_persons (name, photo, bio, instagram, contact_email, payment_method)
      values (
        ${name}, ${nullableTrim(body.photo)}, ${nullableTrim(body.bio)},
        ${nullableTrim(body.instagram)}, ${nullableTrim(body.contactEmail)}, ${nullableTrim(body.paymentMethod)}
      )
      returning id
    `;
    return NextResponse.json({ id: Number(row.id) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A door person with this name already exists' }, { status: 409 });
    }
    throw error;
  }
}
