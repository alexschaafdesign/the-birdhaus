import postgres from 'postgres';
import { sql } from './db';
import type { Show } from './shows';
import { isPaidMethod, type PaidMethod } from './settlements';
import {
  getTwinSceneBands,
  createTwinSceneBand,
  cleanBandcampUrl,
  splitGenres,
  type TwinSceneBand,
} from './twinscene';

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
  // Fields absorbed from the Twin Scene directory — not yet surfaced in
  // Birdhaus's own admin/public UI, but stored so a future consumer (Twin
  // Scene, or another project) can read them from this shared table.
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
  const rows = await sql<BandRow[]>`select * from bands order by name asc`;
  return rows.map(rowToBand);
}

// Same as getAllBands, plus how many Birdhaus shows each band has actually
// played — used by the public gallery to default to "played here" while
// still letting the full shared directory (including Twin Scene imports
// that never played Birdhaus) be revealed on demand.
export async function getAllBandsWithPlayCount(): Promise<Array<Band & { playCount: number }>> {
  const rows = await sql<Array<BandRow & { play_count: number }>>`
    select b.*,
      (select count(*)::int from show_bands sb where sb.band_id = b.id) as play_count
    from bands b
    order by b.name asc
  `;
  return rows.map((row) => ({ ...rowToBand(row), playCount: row.play_count }));
}

export async function getBandBySlug(slug: string): Promise<Band | null> {
  const [row] = await sql<BandRow[]>`select * from bands where slug = ${slug} limit 1`;
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
  title: string;
  date: string;
}

export async function getShowsForBand(bandId: number): Promise<BandShow[]> {
  return sql<BandShow[]>`
    select s.id, s.slug, s.title, s.date::text as date
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
  showTitle: string;
  youtube: string;
  title: string;
}

export async function getVideosForBand(bandId: number): Promise<BandVideo[]> {
  return sql<BandVideo[]>`
    select s.slug as "showSlug", s.title as "showTitle", v.youtube, v.title
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

// Pre-pass for the Edit Show save flow, run BEFORE the DB transaction (external
// HTTP must not happen inside sql.begin). For any entry that's a genuinely new
// band — no bandId yet and no existing local row by name — it creates the band
// in Twin Scene's canonical directory and annotates the entry with the returned
// twinSceneBandId/twinsceneSlug, so resolveShowBandEntries can insert the local
// overlay row already linked. This is the deliberate, human-triggered write
// path the architecture allows (analogous to Crawlspace's picker "add new"),
// NOT the scraper auto-import that was removed after the stub flood — see
// ../twinscene/ARCHITECTURE.md. Best-effort: if Twin Scene is unreachable or
// the write is refused, the entry is left untouched and falls back to a
// Birdhaus-only local band, exactly as before this write-back existed.
export async function attachTwinSceneLinks(bands: Show['bands']): Promise<Show['bands']> {
  const result: NonNullable<unknown>[] = [];
  for (const raw of bands) {
    const band = typeof raw === 'string' ? { name: raw } : raw;
    const hasBandId = (band as { bandId?: number }).bandId;
    const name = typeof band.name === 'string' ? band.name.trim() : '';
    if (hasBandId || !name) {
      result.push(band);
      continue;
    }
    // Skip existing local bands — they're already linked, or deliberately
    // Birdhaus-only. Only names with no local row at all get pushed up.
    const [existing] = await sql<Array<{ id: number }>>`
      select id from bands where lower(name) = lower(${name}) limit 1
    `;
    if (existing) {
      result.push(band);
      continue;
    }
    try {
      const ts = await createTwinSceneBand(name);
      result.push({ ...band, twinSceneBandId: ts.id, twinsceneSlug: ts.slug });
    } catch (error) {
      console.error('[bands] Twin Scene create failed; creating Birdhaus-only band', name, error);
      result.push(band);
    }
  }
  return result as Show['bands'];
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
    // attachTwinSceneLinks() ran before this transaction and, for a genuinely
    // new band, pushed it up to Twin Scene's canonical directory — so link the
    // local overlay row to it here. on conflict (twin_scene_band_id) covers the
    // case where Twin Scene *matched* an existing band already synced locally
    // under a different name: reuse that row rather than hitting the unique
    // constraint. When there's no link (Twin Scene unreachable/unconfigured),
    // twin_scene_band_id is null — nulls never conflict, so it's a plain insert.
    const twinSceneBandId = (band as { twinSceneBandId?: number }).twinSceneBandId ?? null;
    const twinsceneSlug = (band as { twinsceneSlug?: string }).twinsceneSlug ?? null;
    const [created] = await tx<Array<{ id: number }>>`
      insert into bands (slug, name, instagram, bio, photo, twin_scene_band_id, twinscene_slug, synced_at)
      values (
        ${slug}, ${name}, ${instagram}, ${bio}, ${photo},
        ${twinSceneBandId}, ${twinsceneSlug}, ${twinSceneBandId != null ? new Date() : null}
      )
      on conflict (twin_scene_band_id) do update set updated_at = now()
      returning id
    `;
    resolved.push({ ...band, bandId: Number(created.id) });
  }

  return resolved as Show['bands'];
}

export interface ResolvedBand {
  slug: string;
  created: boolean;
}

// Optional profile data Twin Scene can send alongside a lineup-matcher call,
// so a band it already has full data on doesn't land in Birdhaus as a bare
// stub. twinSceneBandId links this row to its canonical Twin Scene record
// (bands.twin_scene_band_id — see migration 017).
export interface TwinSceneBandProfile {
  bio?: string | null;
  photo?: string | null;
  instagram?: string | null;
  genres?: string[];
  city?: string | null;
  neighborhoods?: string[];
  members?: string[];
  contactEmail?: string | null;
  contactMethod?: string | null;
  website?: string | null;
  bandcamp?: string | null;
  bandcampEmbedUrl?: string | null;
  bandcampEmbedHeight?: number | null;
  featuredLinks?: FeaturedLink[];
  twinSceneBandId?: number | null;
}

// Field -> column, for the fill-only-if-empty merge onto an existing match.
// Mirrors scripts/import-twinscene-bands.mjs's MERGE_FIELDS — same semantics,
// just applied live off the API call instead of a one-off CSV import.
const TWINSCENE_MERGE_FIELDS: Array<[keyof TwinSceneBandProfile, string, boolean]> = [
  ['bio', 'bio', false],
  ['photo', 'photo', false],
  ['instagram', 'instagram', false],
  ['genres', 'genres', true],
  ['city', 'city', false],
  ['neighborhoods', 'neighborhoods', true],
  ['members', 'members', true],
  ['contactEmail', 'contact_email', false],
  ['contactMethod', 'contact_method', false],
  ['website', 'website', false],
  ['bandcamp', 'bandcamp', false],
  ['bandcampEmbedUrl', 'bandcamp_embed_url', false],
  ['bandcampEmbedHeight', 'bandcamp_embed_height', false],
  ['featuredLinks', 'featured_links', true],
];

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Used by the public write-back endpoint (Twin Scene lineup matching against
// our band directory). Same case-insensitive match + slug generation as
// resolveShowBandEntries, but standalone rather than operating over a show's
// bands array, and marks new rows unreviewed so they can be triaged in admin
// before being treated as a real Birdhaus band rather than scraper noise.
//
// `profile`, when Twin Scene sends it, is merged fill-only-if-empty onto an
// existing match (never clobbers a value someone already edited in Birdhaus)
// or written wholesale onto a newly-created stub — this is what closes the
// gap where a lineup-matcher hit used to create a permanently-blank stub.
export async function findOrCreateBandByName(
  name: string,
  profile: TwinSceneBandProfile = {}
): Promise<ResolvedBand> {
  return sql.begin(async (tx) => {
    const [existing] = await tx<Array<Record<string, unknown> & { id: number; slug: string }>>`
      select * from bands where lower(name) = lower(${name}) limit 1
    `;

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignments: any[] = [];

      for (const [field, column, isJson] of TWINSCENE_MERGE_FIELDS) {
        if (!isEmptyValue(existing[column])) continue;
        const incoming = profile[field];
        if (isEmptyValue(incoming)) continue;
        assignments.push(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          isJson ? tx`${tx(column)} = ${tx.json(incoming as any)}` : tx`${tx(column)} = ${incoming as any}`
        );
      }

      // Never overwrite an existing link — only claim it the first time.
      if (profile.twinSceneBandId != null && existing.twin_scene_band_id == null) {
        assignments.push(tx`twin_scene_band_id = ${profile.twinSceneBandId}`);
        assignments.push(tx`synced_at = now()`);
      }

      if (assignments.length > 0) {
        const setClause = assignments.reduce(
          (acc, fragment) => (acc === null ? fragment : tx`${acc}, ${fragment}`),
          null
        );
        await tx`update bands set ${setClause}, updated_at = now() where id = ${existing.id}`;
      }

      return { slug: existing.slug, created: false };
    }

    const slug = await uniqueSlug(tx, slugify(name) || 'band');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const featuredLinksJson = tx.json((profile.featuredLinks ?? []) as any);
    const [created] = await tx<Array<{ slug: string }>>`
      insert into bands (
        slug, name, unreviewed, bio, photo, instagram, genres, city, neighborhoods,
        members, contact_email, contact_method, website, bandcamp, bandcamp_embed_url,
        bandcamp_embed_height, featured_links, twin_scene_band_id, synced_at
      )
      values (
        ${slug}, ${name}, true, ${profile.bio ?? null}, ${profile.photo ?? null},
        ${profile.instagram ?? null}, ${tx.json(profile.genres ?? [])}, ${profile.city ?? null},
        ${tx.json(profile.neighborhoods ?? [])}, ${tx.json(profile.members ?? [])},
        ${profile.contactEmail ?? null}, ${profile.contactMethod ?? null}, ${profile.website ?? null},
        ${profile.bandcamp ?? null}, ${profile.bandcampEmbedUrl ?? null}, ${profile.bandcampEmbedHeight ?? null},
        ${featuredLinksJson},
        ${profile.twinSceneBandId ?? null}, ${profile.twinSceneBandId != null ? new Date() : null}
      )
      returning slug
    `;
    return { slug: created.slug, created: true };
  });
}

// Just-in-time sync for the Edit Show form's band typeahead: the operator
// picked a result that only exists in Twin Scene's directory, so create (or,
// on a race with some other sync path, update) the local overlay row and
// hand back a real bands.id to link into the show. `slug` is only set on the
// true-insert path — an existing row keeps its own Birdhaus slug (it's the
// band's public page URL) rather than being renamed by a later re-sync.
// `visible` is untouched here by design (defaults false; see migration 017 —
// flipping it is owned by the show_bands insert path, not this sync).
export async function syncBandFromTwinScene(band: TwinSceneBand): Promise<Band> {
  return sql.begin(async (tx) => {
    const genres = splitGenres(band.genre);
    const { neighborhoods, members, featuredLinks } = band;
    const instagram = band.socials.instagram ?? null;
    const website = band.socials.website ?? null;
    const bandcamp = cleanBandcampUrl(band.socials);
    const bio = band.bio || null;
    const photo = band.photo || null;
    const city = band.city || null;
    const bandcampEmbedUrl = band.bandcampEmbedUrl || null;

    const slug = await uniqueSlug(tx, slugify(band.name) || 'band');

    const genresJson = tx.json(genres);
    const neighborhoodsJson = tx.json(neighborhoods);
    const membersJson = tx.json(members);
    // postgres.js's JSONValue type can't express a readonly-property interface array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const featuredLinksJson = tx.json(featuredLinks as any);

    const [row] = await tx<BandRow[]>`
      insert into bands (
        slug, name, instagram, bio, photo, genres, city, neighborhoods, members,
        website, bandcamp, bandcamp_embed_url, bandcamp_embed_height, featured_links,
        twinscene_slug, twin_scene_band_id, unreviewed, synced_at
      ) values (
        ${slug}, ${band.name}, ${instagram}, ${bio}, ${photo},
        ${genresJson}, ${city}, ${neighborhoodsJson}, ${membersJson},
        ${website}, ${bandcamp}, ${bandcampEmbedUrl}, ${band.bandcampEmbedHeight}, ${featuredLinksJson},
        ${band.slug}, ${band.id}, false, now()
      )
      on conflict (twin_scene_band_id) do update set
        name = excluded.name,
        instagram = excluded.instagram,
        bio = excluded.bio,
        photo = excluded.photo,
        genres = excluded.genres,
        city = excluded.city,
        neighborhoods = excluded.neighborhoods,
        members = excluded.members,
        website = excluded.website,
        bandcamp = excluded.bandcamp,
        bandcamp_embed_url = excluded.bandcamp_embed_url,
        bandcamp_embed_height = excluded.bandcamp_embed_height,
        featured_links = excluded.featured_links,
        twinscene_slug = excluded.twinscene_slug,
        synced_at = now(),
        updated_at = now()
      returning *
    `;

    return rowToBand(row);
  });
}

export interface ShowBandPair {
  bandId: number;
  sortOrder: number;
}

// Derives the show_bands rows (bandId + array-position sort order) from a
// resolveShowBandEntries() result — every entry is guaranteed a bandId by then.
export function toShowBandPairs(resolved: Show['bands']): ShowBandPair[] {
  return resolved.map((band, index) => ({
    bandId: (band as { bandId?: number }).bandId as number,
    sortOrder: index,
  }));
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

export interface TwinSceneSyncResult {
  checked: number;
  updated: number;
  updates: Array<{ slug: string; fields: string[] }>;
}

// Column -> isJson, for the pull-based fill-only-if-empty merge from Twin
// Scene's canonical directory. hometown/isTouring are deliberately excluded —
// Birdhaus-owned booking concepts, not Twin Scene profile data (same
// exclusion scripts/import-twinscene-bands.mjs made for the old CSV import).
// contact_email/contact_method aren't in Twin Scene's public API response at
// all, so there's nothing to pull for them.
const TWINSCENE_PULL_FIELDS: Array<[string, boolean]> = [
  ['bio', false],
  ['photo', false],
  ['city', false],
  ['neighborhoods', true],
  ['members', true],
  ['featured_links', true],
  ['bandcamp_embed_url', false],
  ['bandcamp_embed_height', false],
  ['genres', true],
  ['instagram', false],
  ['website', false],
];

// Twin Scene's `genre` is a single comma-separated string; Birdhaus's
// `genres` is an array — same split Birdhaus would use if it modeled genre
// the same way. `socials.bandcamp` is deliberately not read (see
// lib/twinscene.ts) — bandcampEmbedUrl is the clean source for that.
function deriveIncomingFields(tsBand: TwinSceneBand): Record<string, unknown> {
  return {
    bio: tsBand.bio,
    photo: tsBand.photo,
    city: tsBand.city,
    neighborhoods: tsBand.neighborhoods,
    members: tsBand.members,
    featured_links: tsBand.featuredLinks,
    bandcamp_embed_url: tsBand.bandcampEmbedUrl,
    bandcamp_embed_height: tsBand.bandcampEmbedHeight,
    genres: tsBand.genre
      ? tsBand.genre.split(',').map((g) => g.trim()).filter(Boolean)
      : [],
    instagram: tsBand.socials.instagram ?? null,
    website: tsBand.socials.website ?? null,
  };
}

// Pulls Twin Scene's canonical band directory and, on every Birdhaus band
// linked via twin_scene_band_id, fills any currently-empty profile field
// (fill-only-if-empty — never clobbers a value someone already edited in
// Birdhaus admin) AND overwrites the band's name to match Twin Scene's (name
// is treated as authoritative there, so a rename upstream propagates here).
// This is the live counterpart to Twin Scene's own backfill-band-photos.mjs /
// backfill-band-profile-fields.mjs, run in the opposite direction: Twin Scene
// stopped pushing band data to Birdhaus after its lineup-matcher flooded
// Birdhaus with thousands of bare stub bands (see cleanup-unreviewed-stub-bands.mjs),
// so enrichment now has to be Birdhaus pulling, not Twin Scene pushing.
export async function enrichBandsFromTwinScene(): Promise<TwinSceneSyncResult> {
  const [twinSceneBands, linkedBands] = await Promise.all([
    getTwinSceneBands(),
    sql<Array<Record<string, unknown> & { id: number; slug: string }>>`
      select * from bands where twin_scene_band_id is not null
    `,
  ]);

  const byTwinSceneId = new Map(twinSceneBands.map((b) => [b.id, b]));
  const updates: TwinSceneSyncResult['updates'] = [];

  for (const band of linkedBands) {
    const tsBand = byTwinSceneId.get(Number(band.twin_scene_band_id));
    if (!tsBand) continue;

    const incoming = deriveIncomingFields(tsBand);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignments: any[] = [];
    const filled: string[] = [];

    // Name is authoritative from Twin Scene — overwritten (not fill-only) so a
    // rename in Twin Scene propagates to Birdhaus on the next sync. Slug is left
    // untouched by design (it's this band's stable public URL). tsBand.name can
    // be '' defensively, in which case we keep the existing local name.
    if (tsBand.name && tsBand.name !== band.name) {
      assignments.push(sql`name = ${tsBand.name}`);
      filled.push('name');
    }

    for (const [column, isJson] of TWINSCENE_PULL_FIELDS) {
      if (!isEmptyValue(band[column])) continue;
      const value = incoming[column];
      if (isEmptyValue(value)) continue;
      assignments.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isJson ? sql`${sql(column)} = ${sql.json(value as any)}` : sql`${sql(column)} = ${value as any}`
      );
      filled.push(column);
    }

    if (assignments.length === 0) continue;

    const setClause = assignments.reduce(
      (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
      null
    );
    await sql`update bands set ${setClause}, updated_at = now() where id = ${band.id}`;
    updates.push({ slug: band.slug as string, fields: filled });
  }

  return { checked: linkedBands.length, updated: updates.length, updates };
}
