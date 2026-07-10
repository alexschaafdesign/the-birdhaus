import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public endpoint hit by the Contact page's "Show requests" form.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const bandName = nullableTrim(body.bandName);
  const email = nullableTrim(body.email);

  if (!bandName || !email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
  }

  await sql`
    insert into submissions (
      band_name, contact_name, email, socials, genre, availability_text, comments, source
    )
    values (
      ${bandName},
      ${nullableTrim(body.contactName)},
      ${email},
      ${nullableTrim(body.social)},
      ${nullableTrim(body.vibe)},
      ${nullableTrim(body.dates)},
      ${nullableTrim(body.comments)},
      'form'
    )
  `;

  return NextResponse.json({ ok: true });
}
