import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { SITE_URL } from './site';
import { parseLocalTime, wallTimeToUtc } from './local-time';

// Booking calendar as an iCalendar feed for Apple Calendar & co. See
// scripts/migrations/105_booking_calendar_feed.sql for the token model.

const TIME_ZONE = 'America/Chicago';
const SHOW_DURATION_HOURS = 4; // same window the Square sync uses (7pm doors → 11pm)
const PAST_DAYS = 90;

function newToken() {
  return randomBytes(24).toString('base64url');
}

export function feedUrl(token: string) {
  return `${SITE_URL}/api/booking-calendar/${token}.ics`;
}

// The live token, minting one on first use.
export async function getOrCreateFeedToken(): Promise<string> {
  const [live] = await sql<{ token: string }[]>`
    select token from booking_calendar_feeds where revoked_at is null
  `;
  if (live) return live.token;
  const [row] = await sql<{ token: string }[]>`
    insert into booking_calendar_feeds (token) values (${newToken()})
    on conflict do nothing
    returning token
  `;
  if (row) return row.token;
  // Lost a race with a concurrent first visit — use the winner's token.
  const [winner] = await sql<{ token: string }[]>`
    select token from booking_calendar_feeds where revoked_at is null
  `;
  return winner.token;
}

export async function resetFeedToken(): Promise<string> {
  return sql.begin(async (tx) => {
    await tx`update booking_calendar_feeds set revoked_at = now() where revoked_at is null`;
    const [row] = await tx<{ token: string }[]>`
      insert into booking_calendar_feeds (token) values (${newToken()}) returning token
    `;
    return row.token;
  });
}

export async function isLiveFeedToken(token: string): Promise<boolean> {
  if (token.length < 32) return false;
  const [row] = await sql`
    select 1 as ok from booking_calendar_feeds where token = ${token} and revoked_at is null
  `;
  return Boolean(row);
}

// --- iCalendar text ---------------------------------------------------------

function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545: lines over 75 octets fold onto continuation lines starting with a
// space. Split on code points so multi-byte characters stay intact.
function foldLine(line: string) {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function utcStamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function dateValue(isoDate: string) {
  return isoDate.replace(/-/g, '');
}

function nextDay(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

interface FeedShow {
  id: number;
  title: string;
  date: string;
  announced: boolean;
  doors_time: string | null;
  show_time: string | null;
}

interface FeedDay {
  date: string;
  title: string;
  notepad: string;
}

function showEvent(show: FeedShow, stamp: string): string[] {
  const local = parseLocalTime(show.doors_time) ?? parseLocalTime(show.show_time);
  const summary = show.announced ? show.title : `Draft: ${show.title}`;
  const times = [show.doors_time && `Doors ${show.doors_time}`, show.show_time && `Show ${show.show_time}`]
    .filter(Boolean)
    .join(' · ');
  const lines = ['BEGIN:VEVENT', `UID:show-${show.id}@thebirdhaus.org`, `DTSTAMP:${stamp}`];
  if (local) {
    const start = wallTimeToUtc(show.date, local.hour, local.minute, TIME_ZONE);
    const end = new Date(start.getTime() + SHOW_DURATION_HOURS * 3_600_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(show.date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(show.date))}`);
  }
  lines.push(`SUMMARY:${escapeText(summary)}`);
  if (times) lines.push(`DESCRIPTION:${escapeText(times)}`);
  lines.push(`URL:${SITE_URL}/admin/shows/${show.id}`, 'END:VEVENT');
  return lines;
}

function dayEvent(day: FeedDay, stamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:booking-day-${day.date}@thebirdhaus.org`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateValue(day.date)}`,
    `DTEND;VALUE=DATE:${dateValue(nextDay(day.date))}`,
    `SUMMARY:${escapeText(day.title || 'Booking notes')}`,
    'TRANSP:TRANSPARENT', // all-day notes shouldn't mark the day busy
  ];
  if (day.notepad.trim()) lines.push(`DESCRIPTION:${escapeText(day.notepad)}`);
  lines.push(`URL:${SITE_URL}/admin/booking`, 'END:VEVENT');
  return lines;
}

export async function buildBookingFeed(today: string): Promise<string> {
  const [y, m, d] = today.split('-').map(Number);
  const since = new Date(Date.UTC(y, m - 1, d - PAST_DAYS)).toISOString().slice(0, 10);

  const [shows, days] = await Promise.all([
    sql<FeedShow[]>`
      select id, title, date::text as date, announced, doors_time, show_time
      from shows
      where date >= ${since}
      order by date asc
    `,
    sql<FeedDay[]>`
      select date::text as date, title, notepad
      from booking_days
      where date >= ${since}
      order by date asc
    `,
  ]);

  const stamp = utcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//the BIRDHAUS//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Birdhaus Booking',
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...shows.flatMap((show) => showEvent({ ...show, id: Number(show.id) }, stamp)),
    ...days.flatMap((day) => dayEvent(day, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
