import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { SITE_URL } from '../site';
import { buildIcs } from './ics-out.ts';
import { repeatLabel, type AdminBooking } from './decisions';
import { bookingsByIds } from './decisions';

// Alex's private feed of confirmed rehearsals (Apple Calendar subscribe).
// Calendar apps can't log in, so the URL's secret token is the credential;
// same token model as lib/booking-feed.ts (migration 114). Holds band names,
// gear and payment status: never share the URL.

const PAST_DAYS = 90;

function newToken() {
  return randomBytes(24).toString('base64url');
}

export function rehearsalFeedUrl(token: string) {
  return `${SITE_URL}/api/rehearsal-calendar/${token}.ics`;
}

export async function getOrCreateRehearsalFeedToken(): Promise<string> {
  const [live] = await sql<{ token: string }[]>`select token from rehearsal_calendar_feeds where revoked_at is null`;
  if (live) return live.token;
  const [row] = await sql<{ token: string }[]>`
    insert into rehearsal_calendar_feeds (token) values (${newToken()}) on conflict do nothing returning token
  `;
  if (row) return row.token;
  const [winner] = await sql<{ token: string }[]>`select token from rehearsal_calendar_feeds where revoked_at is null`;
  return winner.token;
}

export async function resetRehearsalFeedToken(): Promise<string> {
  return sql.begin(async (tx) => {
    await tx`update rehearsal_calendar_feeds set revoked_at = now() where revoked_at is null`;
    const [row] = await tx<{ token: string }[]>`insert into rehearsal_calendar_feeds (token) values (${newToken()}) returning token`;
    return row.token;
  });
}

export async function isLiveRehearsalFeedToken(token: string): Promise<boolean> {
  if (token.length < 32) return false;
  const [row] = await sql`select 1 as ok from rehearsal_calendar_feeds where token = ${token} and revoked_at is null`;
  return Boolean(row);
}

function describe(b: AdminBooking): string {
  const gear = [b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — ');
  return [
    `${b.catalogueId} · ${b.bandName}`,
    `Gear: ${gear || 'none'}`,
    `Payment: ${b.paymentStatus === 'unpaid' ? `unpaid (${b.paymentMethod})` : b.paymentStatus}`,
    ...(repeatLabel(b) ? [`Repeats: ${repeatLabel(b)}`] : []),
    ...(b.conflict ? ['CONFLICT: something now overlaps this — check admin'] : []),
    ...(b.note ? [`Note: ${b.note}`] : []),
    `${SITE_URL}/admin/rehearsal/bands/${b.bandId}`,
  ].join('\n');
}

export async function buildRehearsalFeed(now = new Date()): Promise<string> {
  const ids = await sql<{ id: number }[]>`
    select id::int as id from rehearsal_bookings
    where status = 'confirmed' and ends_at > ${new Date(now.getTime() - PAST_DAYS * 86_400_000)}
  `;
  const list = await bookingsByIds(ids.map((r) => r.id));
  return buildIcs(
    list.map((b) => ({
      uid: `${b.catalogueId.toLowerCase()}-admin@thebirdhaus.org`,
      start: b.startsAt,
      end: b.endsAt,
      summary: `${b.conflict ? '⚠ ' : ''}Rehearsal: ${b.bandName}`,
      description: describe(b),
      url: `${SITE_URL}/admin/rehearsal/bands/${b.bandId}`,
    })),
    { name: 'BIRDHAUS rehearsals', now },
  );
}
