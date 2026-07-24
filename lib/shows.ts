import { remark } from 'remark';
import html from 'remark-html';
import { sql } from './db';

export interface Show {
  id: number;
  slug: string;
  title: string;
  date: string;
  doorsTime?: string;
  showTime?: string;
  flyer?: string;
  bands: Array<{ name: string; instagram?: string; bio?: string; photo?: string; bandId?: number }> | string[];
  description?: string;
  photographer?: string | { name: string; instagram?: string };
  rsvpUrl?: string;
  ticketUrl?: string;
  externalTicketUrl?: string;
  rsvpForm?: boolean;
  videos: Array<{ youtube: string; title: string; bandIds?: number[] }>;
  audio?: Array<{ bandcamp: string; title: string }>;
  photos?: string[];
  photoFolder?: string;
  photoCredit?: string;
  content: string;
  announced?: boolean;
  soundEngineerName?: string;
  targetBandCount: number;
  ignoredHealthChecks: string[];
  advanceSent?: boolean;
}

interface ShowRow {
  id: number;
  slug: string;
  title: string;
  date: string;
  doors_time: string | null;
  show_time: string | null;
  flyer: string | null;
  bands: unknown;
  description: string | null;
  photographer: unknown;
  rsvp_url: string | null;
  ticket_url: string | null;
  external_ticket_url: string | null;
  rsvp_form: boolean;
  videos: unknown;
  audio: unknown;
  photos: unknown;
  photo_folder: string | null;
  photo_credit: string | null;
  content_markdown: string;
  announced: boolean;
  sound_engineer_name: string | null;
  target_band_count: number;
  ignored_health_checks: unknown;
  advance_sent: boolean;
}

async function renderMarkdown(markdown: string): Promise<string> {
  const processed = await remark().use(html).process(markdown);
  return processed.toString();
}

// Rendering the markdown body is the expensive part of mapping a row, and only
// the single-show detail page ever reads `content`. List callers (home, archive,
// videos, sitemap, generateStaticParams, ...) don't, so they skip it — otherwise
// getAllShows would run remark once per show on every request for nothing.
async function rowToShow(row: ShowRow, renderContent = false): Promise<Show> {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    date: row.date,
    doorsTime: row.doors_time ?? undefined,
    showTime: row.show_time ?? undefined,
    flyer: row.flyer ?? undefined,
    bands: (row.bands as Show['bands']) ?? [],
    description: row.description ?? undefined,
    photographer: (row.photographer as Show['photographer']) ?? undefined,
    rsvpUrl: row.rsvp_url ?? undefined,
    ticketUrl: row.ticket_url ?? undefined,
    externalTicketUrl: row.external_ticket_url ?? undefined,
    rsvpForm: row.rsvp_form,
    videos: (row.videos as Show['videos']) ?? [],
    audio: (row.audio as Show['audio']) ?? [],
    photos: (row.photos as string[]) ?? [],
    photoFolder: row.photo_folder ?? undefined,
    photoCredit: row.photo_credit ?? undefined,
    content: renderContent ? await renderMarkdown(row.content_markdown) : '',
    announced: row.announced,
    soundEngineerName: row.sound_engineer_name ?? undefined,
    targetBandCount: row.target_band_count,
    ignoredHealthChecks: (row.ignored_health_checks as string[]) ?? [],
    advanceSent: row.advance_sent,
  };
}

// Aggregates show_bands -> bands into the same shape the bands JSONB column
// used to hold, so this join is a drop-in replacement wherever shows.bands
// was read. json_strip_nulls drops absent optional fields (instagram/bio/photo)
// instead of leaving them as explicit nulls, matching the old JSONB's shape.
// A fresh fragment per call site, per postgres.js's dynamic composition pattern.
// Exported so other raw-SQL reads of shows (admin routes/pages) can reuse it.
export function bandsJoinFragment() {
  return sql`
    coalesce((
      select json_strip_nulls(json_agg(json_build_object(
        'bandId', b.id, 'name', b.name, 'instagram', b.instagram, 'bio', b.bio, 'photo', b.photo
      ) order by sb.sort_order))
      from show_bands sb
      join bands b on b.id = sb.band_id
      where sb.show_id = shows.id
    ), '[]'::json) as bands
  `;
}

// Same drop-in-replacement approach as bandsJoinFragment, for show_videos ->
// videos. A video can be tagged to more than one band (e.g. a collaborative
// set), so each entry carries the full ordered list of band_videos ids. The
// json_agg returns null when a video has no band tags, which json_strip_nulls
// then drops, leaving `bandIds` absent rather than an empty array.
export function videosJoinFragment() {
  return sql`
    coalesce((
      select json_strip_nulls(json_agg(json_build_object(
        'youtube', v.youtube,
        'title', v.title,
        'bandIds', (
          select json_agg(bv.band_id order by bv.sort_order)
          from band_videos bv
          where bv.video_id = v.id
        )
      ) order by sv.sort_order))
      from show_videos sv
      join videos v on v.id = sv.video_id
      where sv.show_id = shows.id
    ), '[]'::json) as videos
  `;
}

export async function getAllShows(): Promise<Show[]> {
  const rows = await sql<ShowRow[]>`
    select *, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()}
    from shows
    order by shows.date asc
  `;
  return Promise.all(rows.map((row) => rowToShow(row)));
}

export async function getShowBySlug(slug: string): Promise<Show | null> {
  const [row] = await sql<ShowRow[]>`
    select *, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()}
    from shows
    where slug = ${slug}
    limit 1
  `;
  if (!row) return null;
  return rowToShow(row, true); // detail page reads `content`
}

export async function getShowById(id: number): Promise<Show | null> {
  const [row] = await sql<ShowRow[]>`
    select *, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()}
    from shows
    where id = ${id}
    limit 1
  `;
  if (!row) return null;
  return rowToShow(row);
}

// Today's date in Central Time as "YYYY-MM-DD". Because show.date is also stored
// as "YYYY-MM-DD", these can be compared lexicographically: a show is upcoming while
// show.date >= getTodayCentral(), and flips to past at midnight Central (i.e. right
// after 11:59pm on the day of the show).
export function getTodayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Derives a URL slug from a show's date and title, e.g. "2026-08-15" + "Hairless
// Twin / Greydeer" -> "2026-08-15-hairless-twin-greydeer" — mirrors the naming
// convention already used by the hand-authored content/shows/*.md filenames.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Falls back to the default 3-band bill assumption for missing/invalid input,
// rather than rejecting the request — this field is a soft planning aid, not
// something worth failing a save over.
export function normalizeTargetBandCount(input: unknown): number {
  const n = Number(input);
  return Number.isInteger(n) && n >= 1 ? n : 3;
}

// bands.id is bigserial, so the postgres driver has always serialized it as a
// string over JSON — every show saved before that was caught has a numeric-string
// bandId baked into its stored bands/videos JSON. Coerce those back to real numbers
// before validating, so simply re-saving an existing show self-heals its data
// instead of getting rejected by the (correctly) strict number check below.
function coerceBandId(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export function normalizeBandIds(input: unknown): unknown {
  if (!Array.isArray(input)) return input;
  return input.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const e = entry as Record<string, unknown>;
    let next = entry;
    // Bands carry a single bandId; videos carry a bandIds array — coerce both
    // so numeric-string ids from older JSONB self-heal on re-save.
    if ('bandId' in e) next = { ...next, bandId: coerceBandId(e.bandId) };
    if (Array.isArray(e.bandIds)) next = { ...next, bandIds: e.bandIds.map(coerceBandId) };
    return next;
  });
}

export function isValidBandsInput(input: unknown): input is Show['bands'] {
  return (
    Array.isArray(input) &&
    input.every((band) => {
      if (typeof band === 'string') return true;
      if (!band || typeof band !== 'object') return false;
      const b = band as Record<string, unknown>;
      return (
        typeof b.name === 'string' &&
        (b.instagram === undefined || typeof b.instagram === 'string') &&
        (b.bio === undefined || typeof b.bio === 'string') &&
        (b.photo === undefined || typeof b.photo === 'string') &&
        (b.bandId === undefined || (typeof b.bandId === 'number' && Number.isInteger(b.bandId)))
      );
    })
  );
}

function isOptionalIntArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((n) => typeof n === 'number' && Number.isInteger(n)));
}

export function isValidVideosInput(input: unknown): input is Show['videos'] {
  return (
    Array.isArray(input) &&
    input.every((video) => {
      if (!video || typeof video !== 'object') return false;
      const v = video as Record<string, unknown>;
      return (
        typeof v.youtube === 'string' &&
        typeof v.title === 'string' &&
        // bandIndexes is the transient form input (positions in the lineup);
        // bandIds is the resolved shape. Accept either, both optional.
        isOptionalIntArray(v.bandIndexes) &&
        isOptionalIntArray(v.bandIds)
      );
    })
  );
}

export function isValidAudioInput(input: unknown): input is NonNullable<Show['audio']> {
  return (
    Array.isArray(input) &&
    input.every(
      (audio) =>
        !!audio &&
        typeof audio === 'object' &&
        typeof (audio as Record<string, unknown>).bandcamp === 'string' &&
        typeof (audio as Record<string, unknown>).title === 'string'
    )
  );
}

export function isValidPhotosInput(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((photo) => typeof photo === 'string');
}

export function isValidIgnoredHealthChecksInput(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((key) => typeof key === 'string');
}

// Normalizes an incoming photographer value (string, object, or empty) down to the
// object shape the admin form always writes. Garbage input (wrong type) is
// treated as "no photographer" rather than rejected outright.
export function normalizePhotographerInput(
  input: unknown
): { name: string; instagram?: string } | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    const name = input.trim();
    return name ? { name } : null;
  }
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) return null;
    const instagram = typeof obj.instagram === 'string' ? obj.instagram.trim() : '';
    return instagram ? { name, instagram } : { name };
  }
  return null;
}
