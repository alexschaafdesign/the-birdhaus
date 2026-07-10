import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { SUBMISSION_STATUSES, parseAvailability } from '@/lib/submissions';

export async function GET() {
  const rows = await sql`select * from submissions order by created_at desc`;
  return NextResponse.json(rows);
}

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const bandName = nullableTrim(body?.band_name);
  if (!bandName) {
    return NextResponse.json({ error: 'Band name is required' }, { status: 400 });
  }

  const status = SUBMISSION_STATUSES.includes(body.status) ? body.status : 'new';

  let availability: ReturnType<typeof parseAvailability> = [];
  if (body.availability !== undefined) {
    availability = parseAvailability(body.availability);
    if (availability === null) {
      return NextResponse.json({ error: 'Invalid availability entries' }, { status: 400 });
    }
  }

  const [row] = await sql`
    insert into submissions (
      band_name, contact_name, email, socials, genre,
      availability_text, availability,
      comments, notes, status, source
    )
    values (
      ${bandName},
      ${nullableTrim(body.contact_name)},
      ${nullableTrim(body.email)},
      ${nullableTrim(body.socials)},
      ${nullableTrim(body.genre)},
      ${nullableTrim(body.availability_text)},
      ${sql.json(availability)},
      ${nullableTrim(body.comments)},
      ${nullableTrim(body.notes)},
      ${status},
      'manual'
    )
    returning *
  `;

  return NextResponse.json(row, { status: 201 });
}
