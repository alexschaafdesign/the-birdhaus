import postgres from 'postgres';
import { sql } from './db';

// The three per-show relationship states. 'confirmed' is the assigned engineer
// (at most one per show, enforced by a partial unique index — see
// 018_sound_engineers.sql); 'asked'/'declined' track outreach.
export type SoundEngineerStatus = 'confirmed' | 'asked' | 'declined';

export const SOUND_ENGINEER_STATUSES: SoundEngineerStatus[] = ['confirmed', 'asked', 'declined'];

// One engineer's relationship to a show, as read/written by the show form.
// soundEngineerId is null for a freshly-typed name the operator hasn't saved
// yet — resolveSoundEngineerByName fills it in at save time.
export interface ShowSoundEngineer {
  soundEngineerId: number | null;
  name: string;
  status: SoundEngineerStatus;
}

interface SoundEngineerRow {
  id: number;
  name: string;
}

export interface SoundEngineer {
  id: number;
  name: string;
}

function rowToSoundEngineer(row: SoundEngineerRow): SoundEngineer {
  // bigserial ids come back as strings over the wire; coerce to number so they
  // match the soundEngineerId numbers the form round-trips.
  return { id: Number(row.id), name: row.name };
}

export async function getAllSoundEngineers(): Promise<SoundEngineer[]> {
  const rows = await sql<SoundEngineerRow[]>`select id, name from sound_engineers order by name asc`;
  return rows.map(rowToSoundEngineer);
}

// Full editable profile for the Sound Engineers admin section. contact_email
// already lived on the engineer (used by the advance); photo/bio/instagram were
// added in 049_sound_engineers_profile.sql.
export interface SoundEngineerProfile {
  id: number;
  name: string;
  photo: string | null;
  bio: string | null;
  instagram: string | null;
  contactEmail: string | null;
  // Payment handle (Venmo username, etc.), mirroring bands.payment_method.
  // Admin-only — surfaced on the settlement sheet when paying out.
  paymentMethod: string | null;
}

export async function getSoundEngineerProfile(id: number): Promise<SoundEngineerProfile | null> {
  const [row] = await sql<
    Array<{ id: number; name: string; photo: string | null; bio: string | null; instagram: string | null; contact_email: string | null; payment_method: string | null }>
  >`
    select id, name, photo, bio, instagram, contact_email, payment_method from sound_engineers where id = ${id}
  `;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    photo: row.photo,
    bio: row.bio,
    instagram: row.instagram,
    contactEmail: row.contact_email,
    paymentMethod: row.payment_method,
  };
}

// A show this engineer worked (or was asked about), for the profile page's
// history list. Newest first.
export interface SoundEngineerShow {
  id: number;
  slug: string;
  title: string;
  date: string;
  status: SoundEngineerStatus;
}

export async function getShowsForSoundEngineer(id: number): Promise<SoundEngineerShow[]> {
  const rows = await sql<
    Array<{ id: number; slug: string; title: string; date: string; status: SoundEngineerStatus }>
  >`
    select s.id, s.slug, s.title, s.date::text as date, sse.status
    from show_sound_engineers sse
    join shows s on s.id = sse.show_id
    where sse.sound_engineer_id = ${id}
    order by s.date desc
  `;
  return rows.map((r) => ({ id: Number(r.id), slug: r.slug, title: r.title, date: r.date, status: r.status }));
}

// The confirmed engineer on a show (at most one), with contact email. Used by
// the advance to add them as a recipient and forward band replies to them.
export interface ConfirmedSoundEngineer {
  id: number;
  name: string;
  email: string | null;
}

export async function getConfirmedSoundEngineer(
  showId: number
): Promise<ConfirmedSoundEngineer | null> {
  const [row] = await sql<Array<{ id: number; name: string; contact_email: string | null }>>`
    select se.id, se.name, se.contact_email
    from show_sound_engineers sse
    join sound_engineers se on se.id = sse.sound_engineer_id
    where sse.show_id = ${showId} and sse.status = 'confirmed'
    limit 1
  `;
  if (!row) return null;
  return { id: Number(row.id), name: row.name, email: row.contact_email?.trim() || null };
}

// Sets (or clears, on empty) an engineer's contact email. Persisted on the
// engineer so it carries across their shows.
export async function updateSoundEngineerEmail(id: number, email: string): Promise<void> {
  const clean = email.trim() || null;
  await sql`
    update sound_engineers set contact_email = ${clean}, updated_at = now() where id = ${id}
  `;
}

// Reads a show's engineer relationships (name + status). Confirmed first, then
// asked, then declined; alphabetical within each — matches how the form groups
// them.
export async function getShowSoundEngineers(showId: number): Promise<ShowSoundEngineer[]> {
  const rows = await sql<Array<{ id: number; name: string; status: SoundEngineerStatus }>>`
    select se.id, se.name, sse.status
    from show_sound_engineers sse
    join sound_engineers se on se.id = sse.sound_engineer_id
    where sse.show_id = ${showId}
    order by
      case sse.status when 'confirmed' then 0 when 'asked' then 1 else 2 end,
      se.name asc
  `;
  return rows.map((r) => ({ soundEngineerId: Number(r.id), name: r.name, status: r.status }));
}

// Aggregates show_sound_engineers -> sound_engineers into a JSON array for
// reads of the shows table, so admin queries can pull engineers alongside the
// row in one round trip (mirrors bandsJoinFragment in lib/shows.ts).
export function soundEngineersJoinFragment() {
  return sql`
    coalesce((
      select json_agg(json_build_object(
        'soundEngineerId', se.id, 'name', se.name, 'status', sse.status
      ) order by
        case sse.status when 'confirmed' then 0 when 'asked' then 1 else 2 end,
        se.name)
      from show_sound_engineers sse
      join sound_engineers se on se.id = sse.sound_engineer_id
      where sse.show_id = shows.id
    ), '[]'::json) as sound_engineers
  `;
}

// Validates the array the show form submits. Accepts null/undefined (field
// omitted) as an empty list. Rejects duplicate names and more than one
// 'confirmed' entry up front so the DB's partial unique index never has to.
export function isValidSoundEngineersInput(input: unknown): input is ShowSoundEngineer[] {
  if (input == null) return true;
  if (!Array.isArray(input)) return false;
  let confirmedCount = 0;
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string' || !e.name.trim()) return false;
    if (typeof e.status !== 'string' || !SOUND_ENGINEER_STATUSES.includes(e.status as SoundEngineerStatus)) {
      return false;
    }
    if (
      e.soundEngineerId !== undefined &&
      e.soundEngineerId !== null &&
      !(typeof e.soundEngineerId === 'number' && Number.isInteger(e.soundEngineerId))
    ) {
      return false;
    }
    if (e.status === 'confirmed') confirmedCount += 1;
  }
  if (confirmedCount > 1) return false;
  // Duplicate engineers (same name, case-insensitively) would collide on the
  // (show_id, sound_engineer_id) primary key after name resolution.
  const names = input.map((e) => (e as { name: string }).name.trim().toLowerCase());
  return new Set(names).size === names.length;
}

type Tx = postgres.TransactionSql;

// Find-or-create a sound engineer by name, case-insensitively — the same
// borrow-or-create pattern resolveShowBandEntries uses for bands. Runs inside
// the caller's transaction so a failed show save can't orphan an engineer.
export async function resolveSoundEngineerByName(name: string, tx: Tx): Promise<number> {
  const trimmed = name.trim();
  const [existing] = await tx<Array<{ id: number }>>`
    select id from sound_engineers where lower(name) = lower(${trimmed}) limit 1
  `;
  if (existing) return Number(existing.id);

  const [created] = await tx<Array<{ id: number }>>`
    insert into sound_engineers (name) values (${trimmed}) returning id
  `;
  return Number(created.id);
}

// Records that one engineer was asked about a batch of shows at once — the
// "I texted Jordan about these 8 dates" bulk action on the shows list. Resolves
// (or creates) the engineer by name, then inserts an 'asked' row per show.
// ON CONFLICT DO NOTHING means a show where this engineer is already confirmed/
// asked/declined is left untouched, so this never clobbers an existing status.
// Returns the resolved engineer and how many shows actually got a new row.
export async function addAskedEngineerToShows(
  name: string,
  showIds: number[],
  tx: Tx
): Promise<{ engineer: SoundEngineer; added: number }> {
  const engineerId = await resolveSoundEngineerByName(name, tx);
  const [engineer] = await tx<SoundEngineerRow[]>`
    select id, name from sound_engineers where id = ${engineerId}
  `;

  const rows = showIds.map((showId) => ({
    show_id: showId,
    sound_engineer_id: engineerId,
    status: 'asked' as const,
  }));

  let added = 0;
  if (rows.length > 0) {
    const inserted = await tx`
      insert into show_sound_engineers ${tx(rows, 'show_id', 'sound_engineer_id', 'status')}
      on conflict (show_id, sound_engineer_id) do nothing
      returning show_id
    `;
    added = inserted.length;
  }

  return { engineer: rowToSoundEngineer(engineer), added };
}

// Replaces a show's engineer relationships wholesale — simplest correct way to
// apply additions/removals/status changes from a full-array save without
// diffing (mirrors setShowBands). Resolves each name to a real id first,
// creating registry rows as needed.
export async function setShowSoundEngineers(
  showId: number,
  engineers: ShowSoundEngineer[],
  tx: Tx
): Promise<void> {
  await tx`delete from show_sound_engineers where show_id = ${showId}`;

  const rows: Array<{ show_id: number; sound_engineer_id: number; status: SoundEngineerStatus }> = [];
  let confirmedName: string | null = null;
  for (const engineer of engineers) {
    // Prefer an explicit id (operator picked from the typeahead), but fall back
    // to resolving by name so a just-typed engineer still gets created.
    const id = engineer.soundEngineerId ?? (await resolveSoundEngineerByName(engineer.name, tx));
    rows.push({ show_id: showId, sound_engineer_id: id, status: engineer.status });
    if (engineer.status === 'confirmed') confirmedName = engineer.name.trim();
  }
  if (rows.length > 0) {
    await tx`insert into show_sound_engineers ${tx(rows, 'show_id', 'sound_engineer_id', 'status')}`;
  }

  // Keep shows.sound_engineer_name as a denormalized cache of the confirmed
  // engineer. It's the source the show-health checklist and the settlement
  // pre-fill read from, so this is the single point that keeps them in sync
  // with the registry (the registry is the real source of truth — that column
  // is never edited independently now that the plain field was removed).
  await tx`update shows set sound_engineer_name = ${confirmedName} where id = ${showId}`;
}
