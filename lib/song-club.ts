// Song Club events — admin-run songwriter meetups with a public RSVP form.
// Its own tables (migration 040), independent of the house-show `shows` table:
// these are our own events. Moved over from Twin Scene, adapted to Birdhaus's
// postgres `sql` client. Raw-SQL data layer.

import { sql } from './db';

// Mirrors the `song_club_events` columns (snake_case).
export interface SongClubEvent {
  id: number;
  slug: string;
  title: string;
  event_date: string; // "YYYY-MM-DD" — start date
  end_date: string | null; // "YYYY-MM-DD" — optional end (multi-day events)
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  address: string | null;
  arrival_notes: string | null;
  description: string | null;
  flyer_url: string | null;
  published: boolean;
  playlist_id: number | null;
  format: 'in_person' | 'online';
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

// The shape the admin form posts / the API layer accepts. Slug is derived, not
// supplied.
export interface SongClubEventInput {
  title: string;
  eventDate: string; // "YYYY-MM-DD" — start
  endDate: string | null; // "YYYY-MM-DD" — optional end
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  address: string | null;
  arrivalNotes: string | null;
  description: string | null;
  flyerUrl: string | null;
  published: boolean;
  playlistId: number | null;
  format: 'in_person' | 'online';
}

const COLUMNS = sql`
  id, slug, title, event_date::text as event_date, end_date::text as end_date,
  start_time, end_time, venue_name, address, arrival_notes, description,
  flyer_url, published, playlist_id, format,
  notified_at::text as notified_at, created_at, updated_at
`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The raw JSON body the admin form posts.
export interface SongClubEventBody {
  title?: unknown;
  eventDate?: unknown;
  endDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  venueName?: unknown;
  address?: unknown;
  arrivalNotes?: unknown;
  description?: unknown;
  flyerUrl?: unknown;
  published?: unknown;
  playlistId?: unknown;
  format?: unknown;
}

function optionalTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Validates + normalizes a posted body into a SongClubEventInput, or returns an
// { error } the route turns into a 400. Shared by the create + update routes so
// the two enforce identical rules.
export function buildEventInput(
  body: SongClubEventBody
): SongClubEventInput | { error: string } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return { error: 'Title is required' };

  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.trim() : '';
  if (!ISO_DATE_RE.test(eventDate)) return { error: 'A valid event date is required' };

  // Optional end date for multi-day events; must be a valid date on/after start.
  const endRaw = typeof body.endDate === 'string' ? body.endDate.trim() : '';
  let endDate: string | null = null;
  if (endRaw) {
    if (!ISO_DATE_RE.test(endRaw)) return { error: 'The end date is invalid' };
    if (endRaw < eventDate) return { error: 'The end date must be on or after the start date' };
    endDate = endRaw === eventDate ? null : endRaw; // same day => single-day event
  }

  return {
    title,
    eventDate,
    endDate,
    startTime: optionalTrim(body.startTime),
    endTime: optionalTrim(body.endTime),
    venueName: optionalTrim(body.venueName),
    address: optionalTrim(body.address),
    arrivalNotes: optionalTrim(body.arrivalNotes),
    description: optionalTrim(body.description),
    flyerUrl: optionalTrim(body.flyerUrl),
    published: body.published === true,
    playlistId:
      typeof body.playlistId === 'number' && Number.isInteger(body.playlistId)
        ? body.playlistId
        : null,
    format: body.format === 'online' ? 'online' : 'in_person',
  };
}

// Derives a URL slug from an event's date and title, e.g. "2026-08-15" +
// "August Songwriter Circle" -> "2026-08-15-august-songwriter-circle". Mirrors
// the show slug convention.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Today in Central Time as "YYYY-MM-DD". event_date is stored the same way, so
// the two compare lexicographically: upcoming while event_date >= today.
export function getTodayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// All events, newest first. `publishedOnly` gates out drafts for public callers.
export async function listEvents(
  { publishedOnly = false }: { publishedOnly?: boolean } = {}
): Promise<SongClubEvent[]> {
  return sql<SongClubEvent[]>`
    select ${COLUMNS}
    from song_club_events
    ${publishedOnly ? sql`where published = true` : sql``}
    order by event_date desc, created_at desc
  `;
}

export async function getEventBySlug(slug: string): Promise<SongClubEvent | null> {
  const [row] = await sql<SongClubEvent[]>`
    select ${COLUMNS} from song_club_events where slug = ${slug} limit 1
  `;
  return row ?? null;
}

export async function getEventById(id: number): Promise<SongClubEvent | null> {
  const [row] = await sql<SongClubEvent[]>`
    select ${COLUMNS} from song_club_events where id = ${id} limit 1
  `;
  return row ?? null;
}

// Builds a slug that's unique across events. If the base (date-title) is taken
// by a DIFFERENT event, appends -2, -3, … The excludeId lets an edit keep its
// own slug without colliding with itself.
async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  const taken = await sql<{ slug: string }[]>`
    select slug from song_club_events
    where slug like ${base + '%'} ${excludeId ? sql`and id <> ${excludeId}` : sql``}
  `;
  const set = new Set(taken.map((r) => r.slug));
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

export async function createEvent(input: SongClubEventInput): Promise<SongClubEvent> {
  const slug = await uniqueSlug(slugify(`${input.eventDate}-${input.title}`));
  const [row] = await sql<SongClubEvent[]>`
    insert into song_club_events
      (slug, title, event_date, end_date, start_time, end_time, venue_name, address,
       arrival_notes, description, flyer_url, published, playlist_id, format)
    values
      (${slug}, ${input.title}, ${input.eventDate}, ${input.endDate}, ${input.startTime},
       ${input.endTime}, ${input.venueName}, ${input.address},
       ${input.arrivalNotes}, ${input.description}, ${input.flyerUrl},
       ${input.published}, ${input.playlistId}, ${input.format})
    returning ${COLUMNS}
  `;
  return row;
}

export async function updateEvent(
  id: number,
  input: SongClubEventInput
): Promise<SongClubEvent | null> {
  const slug = await uniqueSlug(slugify(`${input.eventDate}-${input.title}`), id);
  const [row] = await sql<SongClubEvent[]>`
    update song_club_events set
      slug = ${slug},
      title = ${input.title},
      event_date = ${input.eventDate},
      end_date = ${input.endDate},
      start_time = ${input.startTime},
      end_time = ${input.endTime},
      venue_name = ${input.venueName},
      address = ${input.address},
      arrival_notes = ${input.arrivalNotes},
      description = ${input.description},
      flyer_url = ${input.flyerUrl},
      published = ${input.published},
      playlist_id = ${input.playlistId},
      format = ${input.format},
      updated_at = now()
    where id = ${id}
    returning ${COLUMNS}
  `;
  return row ?? null;
}

export async function deleteEvent(id: number): Promise<boolean> {
  const result = await sql`delete from song_club_events where id = ${id}`;
  return result.count > 0;
}

// Atomically claim the one-time "new event" blast: stamps notified_at only if
// it's still null, returning true to the single caller that won the race.
// Prevents a double blast if publish is toggled/saved more than once.
export async function claimEventNotification(id: number): Promise<boolean> {
  const result = await sql`
    update song_club_events set notified_at = now()
    where id = ${id} and notified_at is null
  `;
  return result.count > 0;
}
