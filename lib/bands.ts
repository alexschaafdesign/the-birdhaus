import postgres from 'postgres';
import { sql } from './db';
import { normalizePhotosInput, type Show, type ShowPhoto } from './shows';
import { isPaidMethod, type PaidMethod } from './settlements';
import { cleanBandcampUrl, splitGenres, type TwinSceneBand } from './twinscene';

export interface FeaturedLink {
  url: string;
  label: string;
  image: string;
}

export interface Band {
  id: number;
  slug: string;
  name: string;
  instagram?: string;
  bio?: string;
  photo?: string;
  isTouring: boolean;
  hometown?: string;
  // Copied from Twin Scene when a band is imported. Not shown anywhere in
  // Birdhaus's admin or public UI yet.
  genres: string[];
  city?: string;
  neighborhoods: string[];
  members: string[];
  contactEmail?: string;
  contactMethod?: string;
  website?: string;
  bandcamp?: string;
  bandcampEmbedUrl?: string;
  bandcampEmbedHeight?: number;
  featuredLinks: FeaturedLink[];
  twinsceneSlug?: string;
}

// Every bands column a query returns. Listed, never `*`: through Neon's pooler a `select *` keeps returning the old
// shape from a cached prepared statement after a migration adds a column, and
// fails ("cached plan must not change result type") — see CLAUDE.md.
// Use as ${sql(BAND_COLUMNS)} (or ${tx(BAND_COLUMNS)} inside a transaction).
export const BAND_COLUMNS = [
  'id', 'slug', 'name', 'instagram', 'bio', 'photo', 'created_at', 'updated_at', 'is_touring',
  'hometown', 'genres', 'city', 'neighborhoods', 'members', 'contact_email', 'contact_method',
  'website', 'bandcamp', 'bandcamp_embed_url', 'bandcamp_embed_height', 'featured_links',
  'twinscene_slug', 'unreviewed', 'twin_scene_band_id', 'visible', 'synced_at', 'payment_method',
];

interface BandRow {
  id: number;
  slug: string;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  is_touring: boolean;
  hometown: string | null;
  genres: unknown;
  city: string | null;
  neighborhoods: unknown;
  members: unknown;
  contact_email: string | null;
  contact_method: string | null;
  website: string | null;
  bandcamp: string | null;
  bandcamp_embed_url: string | null;
  bandcamp_embed_height: number | null;
  featured_links: unknown;
  twinscene_slug: string | null;
}

function rowToBand(row: BandRow): Band {
  return {
    // bands.id is bigserial — the postgres driver serializes int8 columns as
    // strings over the wire despite BandRow's `number` annotation; coerce back
    // so Band.id matches the bandId numbers stored in shows.bands JSON.
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    instagram: row.instagram ?? undefined,
    bio: row.bio ?? undefined,
    photo: row.photo ?? undefined,
    isTouring: row.is_touring,
    hometown: row.hometown ?? undefined,
    genres: (row.genres as string[]) ?? [],
    city: row.city ?? undefined,
    neighborhoods: (row.neighborhoods as string[]) ?? [],
    members: (row.members as string[]) ?? [],
    contactEmail: row.contact_email ?? undefined,
    contactMethod: row.contact_method ?? undefined,
    website: row.website ?? undefined,
    bandcamp: row.bandcamp ?? undefined,
    bandcampEmbedUrl: row.bandcamp_embed_url ?? undefined,
    bandcampEmbedHeight: row.bandcamp_embed_height ?? undefined,
    featuredLinks: (row.featured_links as FeaturedLink[]) ?? [],
    twinsceneSlug: row.twinscene_slug ?? undefined,
  };
}

// Small local copy — mirrors lib/shows.ts's slugify() and ShowForm.tsx's own
// client-side copy. Kept separate so this module doesn't pull in remark just
// for a string helper.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getAllBands(): Promise<Band[]> {
  const rows = await sql<BandRow[]>`select ${sql(BAND_COLUMNS)} from bands order by name asc`;
  return rows.map(rowToBand);
}

// Same as getAllBands, plus how many Birdhaus shows each band has actually
// played — used by the public gallery to default to "played here" while
// still letting bands with no show yet be revealed on demand.
export async function getAllBandsWithPlayCount(): Promise<Array<Band & { playCount: number }>> {
  const rows = await sql<Array<BandRow & { play_count: number }>>`
    select ${sql(BAND_COLUMNS)},
      (select count(*)::int from show_bands sb where sb.band_id = b.id) as play_count
    from bands b
    order by b.name asc
  `;
  return rows.map((row) => ({ ...rowToBand(row), playCount: row.play_count }));
}

export async function getBandBySlug(slug: string): Promise<Band | null> {
  const [row] = await sql<BandRow[]>`select ${sql(BAND_COLUMNS)} from bands where slug = ${slug} limit 1`;
  return row ? rowToBand(row) : null;
}

// Whole id->slug map, cheap at this table's scale — reused by the show detail
// page and the home/archive alum rosters to resolve a bandId into a link.
export async function getAllBandSlugs(): Promise<Map<number, string>> {
  const rows = await sql<Array<{ id: number; slug: string }>>`select id, slug from bands`;
  return new Map(rows.map((r) => [Number(r.id), r.slug]));
}

export interface BandShow {
  id: number;
  slug: string;
  catalogueId: string;
  title: string;
  date: string;
  announced: boolean;
}

export async function getShowsForBand(bandId: number): Promise<BandShow[]> {
  return sql<BandShow[]>`
    select s.id, s.slug, s.catalogue_id as "catalogueId", s.title, s.date::text as date, s.announced
    from show_bands sb
    join shows s on s.id = sb.show_id
    where sb.band_id = ${bandId}
    order by s.date desc
  `;
}

export interface ShowBandPaidStatus {
  bandId: number;
  name: string;
  paid: boolean;
  // How the payout was made (show_bands.paid_method). Null when unpaid, or
  // for payouts recorded before the method was tracked.
  paidMethod: PaidMethod | null;
  // Excluded from the payout split — the artist pool is divided only among
  // the bands that aren't excluded (show_bands.excluded).
  excluded: boolean;
  // Private payout handle (Venmo, etc.), shown on the settlement tab so it's on
  // hand when paying out. Admin-only — never leaves the Birdhaus admin.
  paymentMethod: string | null;
  // Per-band manual dollar adjustment (show_bands.payout_override). null = pay the
  // band exactly what it's due (its percentage share, or the even split); a set
  // value is the amount actually paid, and the difference from what it's due flows
  // to the venue net as profit.
  payoutOverride: number | null;
  // Per-band percentage of the artist pool (show_bands.payout_pct). null = even
  // split; a set value (e.g. 50) makes this band due that share of the pool — the
  // knob behind an uneven split like 50/25/25. Coexists with payoutOverride: the
  // percentage sets what's due, the override sets what's paid.
  payoutPct: number | null;
  // Free-text note explaining a manual dollar adjustment (show_bands.payout_note),
  // e.g. "band said pay them $50 and keep the rest". null when there's no note.
  payoutNote: string | null;
  // Band photo URL (bands.photo), shown as an avatar on the payout checklist.
  photo: string | null;
}

// Payout checklist for the settlement form — who played this show and
// whether they've been paid, per band (show_bands.paid).
export async function getShowBandsPaidStatus(showId: number): Promise<ShowBandPaidStatus[]> {
  const rows = await sql<
    Array<{
      band_id: number;
      name: string;
      paid: boolean;
      paid_method: string | null;
      excluded: boolean;
      payment_method: string | null;
      payout_override: string | null;
      payout_pct: string | null;
      payout_note: string | null;
      photo: string | null;
    }>
  >`
    select b.id as band_id, b.name, sb.paid, sb.paid_method, sb.excluded, b.payment_method, sb.payout_override, sb.payout_pct, sb.payout_note, b.photo
    from show_bands sb
    join bands b on b.id = sb.band_id
    where sb.show_id = ${showId}
    order by sb.sort_order
  `;
  return rows.map((r) => ({
    bandId: r.band_id,
    name: r.name,
    paid: r.paid,
    paidMethod: isPaidMethod(r.paid_method) ? r.paid_method : null,
    excluded: r.excluded,
    paymentMethod: r.payment_method,
    // numeric comes back as a string from postgres.js; null stays null.
    payoutOverride: r.payout_override === null ? null : Number(r.payout_override),
    payoutPct: r.payout_pct === null ? null : Number(r.payout_pct),
    payoutNote: r.payout_note,
    photo: r.photo,
  }));
}

// Toggles a single band's paid status for a show — a standalone write
// separate from the settlement record, since show_bands has no dependency
// on a settlements row existing. Returns null if the show/band pairing
// doesn't exist.
export async function setShowBandPaid(
  showId: number,
  bandId: number,
  paid: boolean,
  paidMethod: PaidMethod | null = null
): Promise<{ paid: boolean; paidMethod: PaidMethod | null } | null> {
  // Unmarking always clears the method — a method only means something for a
  // payment that happened.
  const method = paid ? paidMethod : null;
  const [row] = await sql<Array<{ paid: boolean; paid_method: string | null }>>`
    update show_bands set paid = ${paid}, paid_method = ${method}
    where show_id = ${showId} and band_id = ${bandId}
    returning paid, paid_method
  `;
  if (!row) return null;
  return { paid: row.paid, paidMethod: isPaidMethod(row.paid_method) ? row.paid_method : null };
}

// Toggles whether a band is excluded from the payout split for a show —
// like setShowBandPaid, a standalone write on show_bands. Returns null if
// the show/band pairing doesn't exist.
export async function setShowBandExcluded(
  showId: number,
  bandId: number,
  excluded: boolean
): Promise<boolean | null> {
  const [row] = await sql<Array<{ excluded: boolean }>>`
    update show_bands set excluded = ${excluded}
    where show_id = ${showId} and band_id = ${bandId}
    returning excluded
  `;
  return row ? row.excluded : null;
}

// Sets (or clears) a band's manual dollar adjustment for a show. Pass null to
// clear it and pay the band exactly what it's due (its percentage share, or the
// even split). Coexists with the percentage share — the pct sets what's due, this
// sets what's actually paid. Like the paid/excluded setters, a standalone write on
// show_bands. Returns the stored override (null when cleared) on success, or
// `undefined` if the show/band pairing doesn't exist — distinct from a
// successfully-stored null.
export async function setShowBandPayoutOverride(
  showId: number,
  bandId: number,
  override: number | null
): Promise<number | null | undefined> {
  // Clearing the override drops any note with it — the note only documents an
  // adjustment, so it's meaningless once the band is paid its due amount again.
  const [row] = await sql<Array<{ payout_override: string | null }>>`
    update show_bands
      set payout_override = ${override},
          payout_note = case when ${override}::numeric is null then null else payout_note end
    where show_id = ${showId} and band_id = ${bandId}
    returning payout_override
  `;
  if (!row) return undefined;
  return row.payout_override === null ? null : Number(row.payout_override);
}

// Sets (or clears) a band's percentage-of-pool share for a show. Pass null to
// clear it and fall back to the even split. Coexists with any manual dollar
// override. Standalone write on show_bands; returns the stored percentage (null
// when cleared), or `undefined` if the show/band pairing doesn't exist.
export async function setShowBandPayoutPct(
  showId: number,
  bandId: number,
  pct: number | null
): Promise<number | null | undefined> {
  const [row] = await sql<Array<{ payout_pct: string | null }>>`
    update show_bands set payout_pct = ${pct}
    where show_id = ${showId} and band_id = ${bandId}
    returning payout_pct
  `;
  if (!row) return undefined;
  return row.payout_pct === null ? null : Number(row.payout_pct);
}

// Sets (or clears) the free-text note explaining a band's manual payout
// adjustment. Pass null or an empty string to clear it. Standalone write on
// show_bands; returns the stored note (null when cleared), or `undefined` if the
// show/band pairing doesn't exist.
export async function setShowBandPayoutNote(
  showId: number,
  bandId: number,
  note: string | null
): Promise<string | null | undefined> {
  const trimmed = note && note.trim() !== '' ? note.trim() : null;
  const [row] = await sql<Array<{ payout_note: string | null }>>`
    update show_bands set payout_note = ${trimmed}
    where show_id = ${showId} and band_id = ${bandId}
    returning payout_note
  `;
  if (!row) return undefined;
  return row.payout_note;
}

// Sets (or clears) a band's private payout handle (bands.payment_method — Venmo
// etc.). Unlike the setters above this writes the *band*, not show_bands, so the
// handle sticks and prefills every future settlement. Still guarded by the
// show/band pairing since it's edited from a show's settlement tab; returns the
// stored handle (null when cleared), or `undefined` if the pairing doesn't exist.
export async function setBandPaymentMethod(
  showId: number,
  bandId: number,
  paymentMethod: string | null
): Promise<string | null | undefined> {
  const trimmed = paymentMethod && paymentMethod.trim() !== '' ? paymentMethod.trim() : null;
  const [row] = await sql<Array<{ payment_method: string | null }>>`
    update bands set payment_method = ${trimmed}, updated_at = now()
    where id = ${bandId}
      and exists (select 1 from show_bands where show_id = ${showId} and band_id = ${bandId})
    returning payment_method
  `;
  if (!row) return undefined;
  return row.payment_method;
}

export interface BandVideo {
  showSlug: string;
  showCatalogueId: string;
  showTitle: string;
  youtube: string;
  title: string;
}

export async function getVideosForBand(bandId: number): Promise<BandVideo[]> {
  return sql<BandVideo[]>`
    select s.slug as "showSlug", s.catalogue_id as "showCatalogueId", s.title as "showTitle", v.youtube, v.title
    from band_videos bv
    join videos v on v.id = bv.video_id
    join show_videos sv on sv.video_id = v.id
    join shows s on s.id = sv.show_id
    where bv.band_id = ${bandId}
    order by s.date desc
  `;
}

type Tx = postgres.TransactionSql;

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from bands where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// Resolves each show band entry to a real bands.id, creating a new band
// profile for any name that doesn't already match one. Runs inside the
// caller's transaction so a failed show save can't leave orphan bands, and
// two new same-named entries in one show correctly resolve to a single row.
export async function resolveShowBandEntries(bands: Show['bands'], tx: Tx): Promise<Show['bands']> {
  const resolved: NonNullable<unknown>[] = [];

  for (const raw of bands) {
    const band = typeof raw === 'string' ? { name: raw } : raw;
    const existingBandId = (band as { bandId?: number }).bandId;
    if (existingBandId) {
      // The operator can edit instagram/bio/photo for an already-linked band
      // right here in the show form — without this, those edits only ever
      // landed in this show's own `bands` JSONB, which the Bands directory
      // never reads, so they'd silently vanish from the band's real profile.
      // coalesce() so a field the operator left blank on this particular show
      // doesn't blank out an existing value on the band's profile.
      const instagram = (band as { instagram?: string }).instagram ?? null;
      const bio = (band as { bio?: string }).bio ?? null;
      const photo = (band as { photo?: string }).photo ?? null;
      if (instagram !== null || bio !== null || photo !== null) {
        await tx`
          update bands
          set
            instagram = coalesce(${instagram}, instagram),
            bio = coalesce(${bio}, bio),
            photo = coalesce(${photo}, photo),
            updated_at = now()
          where id = ${existingBandId}
        `;
      }
      resolved.push(band);
      continue;
    }

    const name = band.name.trim();
    const [existing] = await tx<Array<{ id: number }>>`
      select id from bands where lower(name) = lower(${name}) limit 1
    `;

    if (existing) {
      // bands.id is bigserial — the driver returns int8 columns as strings
      // despite the `{ id: number }` annotation above; coerce so the bandId
      // stored in this show's JSON is a real number, not "93".
      resolved.push({ ...band, bandId: Number(existing.id) });
      continue;
    }

    const slug = await uniqueSlug(tx, slugify(name) || 'band');
    const instagram = (band as { instagram?: string }).instagram ?? null;
    const bio = (band as { bio?: string }).bio ?? null;
    const photo = (band as { photo?: string }).photo ?? null;
    const [created] = await tx<Array<{ id: number }>>`
      insert into bands (slug, name, instagram, bio, photo)
      values (${slug}, ${name}, ${instagram}, ${bio}, ${photo})
      returning id
    `;
    resolved.push({ ...band, bandId: Number(created.id) });
  }

  return resolved as Show['bands'];
}

// One-shot import for the Edit Show form's band typeahead: the operator picked
// a band that only exists in Twin Scene's directory, so copy its public profile
// into a new Birdhaus row and hand back a real bands.id for the show. This is a
// copy, not a link: nothing syncs afterwards, and the Birdhaus row is edited
// only in Birdhaus. twinscene_slug is kept for the "Twin Scene" links on the
// band page and Inputs desk. Re-importing a band already copied returns the
// existing row untouched.
export async function importBandFromTwinScene(band: TwinSceneBand): Promise<Band> {
  return sql.begin(async (tx) => {
    const [existing] = await tx<BandRow[]>`
      select ${tx(BAND_COLUMNS)} from bands
      where twin_scene_band_id = ${band.id} or twinscene_slug = ${band.slug}
      limit 1
    `;
    if (existing) return rowToBand(existing);

    const slug = await uniqueSlug(tx, slugify(band.name) || 'band');
    // postgres.js's JSONValue type can't express a readonly-property interface array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const featuredLinksJson = tx.json(band.featuredLinks as any);
    const [row] = await tx<BandRow[]>`
      insert into bands (
        slug, name, instagram, bio, photo, genres, city, neighborhoods, members,
        website, bandcamp, bandcamp_embed_url, bandcamp_embed_height, featured_links,
        twinscene_slug, twin_scene_band_id
      ) values (
        ${slug}, ${band.name}, ${band.socials.instagram ?? null}, ${band.bio || null}, ${band.photo || null},
        ${tx.json(splitGenres(band.genre))}, ${band.city || null}, ${tx.json(band.neighborhoods)},
        ${tx.json(band.members)}, ${band.socials.website ?? null}, ${cleanBandcampUrl(band.socials)},
        ${band.bandcampEmbedUrl || null}, ${band.bandcampEmbedHeight}, ${featuredLinksJson},
        ${band.slug}, ${band.id}
      )
      returning ${tx(BAND_COLUMNS)}
    `;
    return rowToBand(row);
  });
}

export interface ShowBandPair {
  bandId: number;
  sortOrder: number;
  // The set's note. undefined = the caller didn't send one, so the stored note
  // is left alone; null clears it.
  notes?: string | null;
}

// Derives the show_bands rows (bandId + array-position sort order) from a
// resolveShowBandEntries() result — every entry is guaranteed a bandId by then.
export function toShowBandPairs(resolved: Show['bands']): ShowBandPair[] {
  return resolved.map((band, index) => {
    const notes = typeof band === 'string' ? undefined : band.notes;
    return {
      bandId: (band as { bandId?: number }).bandId as number,
      sortOrder: index,
      ...(typeof notes === 'string' ? { notes: notes.trim() || null } : {}),
    };
  });
}

// The bands JSONB copy (the TEMPORARY dual-write) without set notes, which
// live only on show_bands.
export function stripSetNotes(bands: Show['bands']): Show['bands'] {
  return bands.map((band) => {
    if (typeof band === 'string') return band;
    const { notes: _notes, ...rest } = band;
    void _notes;
    return rest;
  }) as Show['bands'];
}

// Applies reordering/additions/removals from a full-array save. Upserts on
// (show_id, band_id) rather than delete-then-insert so an existing row's
// `paid` status survives an unrelated show edit (e.g. changing the flyer) —
// ShowForm always resends the full bands array on every save. Runs in the
// same transaction as the show save, alongside (not replacing) the existing
// bands JSONB write.
export async function setShowBands(showId: number, bands: ShowBandPair[], tx: Tx): Promise<void> {
  const keepBandIds = bands.map((b) => b.bandId);
  if (keepBandIds.length === 0) {
    await tx`delete from show_bands where show_id = ${showId}`;
    return;
  }
  await tx`delete from show_bands where show_id = ${showId} and not (band_id = any(${keepBandIds}))`;
  const rows = bands.map((b) => ({ show_id: showId, band_id: b.bandId, sort_order: b.sortOrder }));
  await tx`
    insert into show_bands ${tx(rows, 'show_id', 'band_id', 'sort_order')}
    on conflict (show_id, band_id) do update set sort_order = excluded.sort_order
  `;
  // Notes only for entries that carried the key, so a caller that saves the
  // lineup without notes never wipes them.
  for (const b of bands) {
    if (b.notes === undefined) continue;
    await tx`update show_bands set notes = ${b.notes} where show_id = ${showId} and band_id = ${b.bandId}`;
  }
}

// Set notes saved on their own, without the lineup: the show form's post-show
// (Public page) tab edits notes but doesn't own the lineup. Only touches bands
// already on this show; '' / blank clears.
export function parseSetNotesInput(input: unknown): Array<{ bandId: number; notes: string | null }> | null {
  if (!Array.isArray(input)) return null;
  const out: Array<{ bandId: number; notes: string | null }> = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') return null;
    const { bandId, notes } = entry as { bandId?: unknown; notes?: unknown };
    const id = Number(bandId);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (notes !== null && typeof notes !== 'string') return null;
    out.push({ bandId: id, notes: typeof notes === 'string' ? notes.trim() || null : null });
  }
  return out;
}

export async function setShowBandNotes(
  showId: number,
  notes: Array<{ bandId: number; notes: string | null }>,
  tx: Tx
): Promise<void> {
  for (const n of notes) {
    await tx`update show_bands set notes = ${n.notes} where show_id = ${showId} and band_id = ${n.bandId}`;
  }
}

// Maps each video's transient `bandIndexes` (positions within the *same
// request's* bands array, as sent by ShowForm.tsx) to the real bandIds that
// resolveShowBandEntries just resolved those positions to — bridges "which
// bands is this a video of" to real ids even when a band was just created in
// this same save. A video can be tagged to several bands (collaborative sets).
// The indexes are never persisted; the legacy single `bandIndex` is still
// accepted so older callers keep working.
export function resolveVideoBandIds(
  videos: unknown[],
  resolvedBands: Show['bands'] | undefined
): Show['videos'] {
  return videos.map((raw) => {
    const { bandIndex, bandIndexes, ...rest } = raw as Record<string, unknown>;
    const indexes = Array.isArray(bandIndexes)
      ? (bandIndexes as unknown[]).filter((i): i is number => typeof i === 'number')
      : typeof bandIndex === 'number'
        ? [bandIndex]
        : [];
    const bandIds = indexes
      .map((i) => (resolvedBands?.[i] as { bandId?: number } | undefined)?.bandId)
      .filter((id): id is number => typeof id === 'number' && id > 0);
    // Dedupe in case the same band is picked twice.
    const uniqueBandIds = [...new Set(bandIds)];
    return (uniqueBandIds.length > 0
      ? { ...rest, bandIds: uniqueBandIds }
      : rest) as Show['videos'][number];
  });
}

// The photo-gallery counterpart of resolveVideoBandIds: each photo's transient
// `bandIndex` (a position in the same request's bands array) becomes the real
// `bandId` of the set it's from. One band per photo; no index = night-level.
// An entry that arrives with a numeric bandId and no bandIndex keeps it, so a
// caller that tags by id still round-trips through normalizePhotosInput.
export function resolvePhotoBandIds(
  photos: unknown,
  resolvedBands: Show['bands'] | undefined
): ShowPhoto[] {
  if (!Array.isArray(photos)) return [];
  return normalizePhotosInput(
    photos.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const { bandIndex, ...rest } = raw as Record<string, unknown>;
      if (typeof bandIndex !== 'number') return rest;
      const bandId = (resolvedBands?.[bandIndex] as { bandId?: number } | undefined)?.bandId;
      return { ...rest, bandId: typeof bandId === 'number' && bandId > 0 ? bandId : undefined };
    })
  );
}
