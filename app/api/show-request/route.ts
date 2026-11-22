import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  parseAvailability,
  formatAvailabilityEntries,
  parseBillPreference,
  parseFormats,
} from '@/lib/submissions';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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

  // Honeypot: hidden field only bots fill. Fake success, skip the insert.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const allowed = await checkRateLimit(`show-request:${getClientIp(request)}`, 10, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests from this connection. Please try again later.' },
      { status: 429 }
    );
  }

  const bandName = nullableTrim(body.bandName);
  const email = nullableTrim(body.email);

  if (!bandName || !email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
  }

  const availability = parseAvailability(body.availability) ?? [];
  const billPreference = parseBillPreference(body.billPreference);
  // No dates is a choice on the form ("No specific dates in mind"); say so on
  // the admin card. The board's date filter still treats it as undated.
  const availabilityText =
    availability.length > 0 ? formatAvailabilityEntries(availability) : 'No specific dates in mind';

  await sql`
    insert into submissions (
      band_name, contact_name, email, socials, genre, availability_text, availability,
      bill_preference, formats, bill_lineup, comments, source
    )
    values (
      ${bandName},
      ${nullableTrim(body.contactName)},
      ${email},
      ${nullableTrim(body.social)},
      ${nullableTrim(body.vibe)},
      ${availabilityText},
      ${sql.json(availability)},
      ${billPreference},
      ${parseFormats(body.formats)}::text[],
      ${billPreference === 'joining' ? null : nullableTrim(body.billLineup)?.slice(0, 2000) ?? null},
      ${nullableTrim(body.comments)},
      'form'
    )
  `;

  return NextResponse.json({ ok: true });
}
