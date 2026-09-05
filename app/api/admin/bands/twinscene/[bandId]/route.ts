import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import {
  getTwinSceneBandEditable,
  updateTwinSceneBandFull,
  createTwinSceneBandFull,
  getTwinSceneBands,
  type TwinSceneBandInput,
  type TwinSceneEditableBand,
} from '@/lib/twinscene';
import { syncBandFromTwinScene } from '@/lib/bands';
import { requireAdmin } from '@/lib/admin-session';

// Full "Edit band" from the Edit Show form — the counterpart to the create modal
// (POST /api/admin/bands/twinscene/create). Keyed by the LOCAL overlay band id
// the show row already carries:
//
//  GET  → the full editable profile to pre-fill the modal. A linked row reads
//         Twin Scene's canonical profile (GET [slug]?edit=1); an unlinked local
//         row (a legacy band that predates the write-back) maps its own columns.
//  PUT  → save. A linked row PATCHes Twin Scene in place; an unlinked row is
//         pushed up (create + link the local row), then either way the local
//         overlay is re-synced from Twin Scene's authoritative values.
//
// The show row's snapshot (name/instagram/bio/photo) is handed back so the form
// can refresh it, same shape as the create route's response.

interface LocalRow {
  id: number;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  is_touring: boolean;
  genres: unknown;
  city: string | null;
  neighborhoods: unknown;
  members: unknown;
  contact_email: string | null;
  contact_method: string | null;
  website: string | null;
  bandcamp: string | null;
  featured_links: unknown;
  twin_scene_band_id: string | number | null;
  twinscene_slug: string | null;
}

const SELECT_COLS = sql`
  id, name, instagram, bio, photo, is_touring, genres, city, neighborhoods,
  members, contact_email, contact_method, website, bandcamp, featured_links,
  twin_scene_band_id, twinscene_slug
`;

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
const linkArr = (v: unknown): { url: string; label: string; image: string }[] =>
  Array.isArray(v)
    ? v
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
        .map((l) => ({ url: s(l.url), label: s(l.label), image: '' }))
        .filter((l) => l.url)
    : [];

// An unlinked local row mapped into the same editable shape Twin Scene returns,
// so the modal pre-fills identically whether or not the band is linked yet.
function localToEditable(row: LocalRow): TwinSceneEditableBand {
  return {
    id: 0,
    slug: '',
    name: row.name,
    genres: strArr(row.genres),
    similarTo: [],
    city: row.city ?? '',
    locality: row.is_touring ? 'touring' : '',
    neighborhoods: strArr(row.neighborhoods),
    members: strArr(row.members),
    contactEmail: row.contact_email ?? '',
    contactMethod: row.contact_method ?? '',
    website: row.website ?? '',
    instagram: row.instagram ?? '',
    facebook: '',
    bandcamp: row.bandcamp ?? '',
    bandcampLink: '',
    youtubeChannel: '',
    bio: row.bio ?? '',
    featuredLinks: linkArr(row.featured_links).map((l) => ({ url: l.url, label: l.label })),
    photoUrl: row.photo ?? '',
  };
}

async function loadLocal(bandId: number): Promise<LocalRow | null> {
  const [row] = await sql<LocalRow[]>`select ${SELECT_COLS} from bands where id = ${bandId}`;
  return row ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { bandId } = await params;
  const id = Number(bandId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid band id' }, { status: 400 });
  }

  const row = await loadLocal(id);
  if (!row) {
    return NextResponse.json({ error: 'Band not found' }, { status: 404 });
  }

  // Linked → read the canonical editable profile; unlinked → map local columns.
  if (row.twin_scene_band_id != null && row.twinscene_slug) {
    try {
      const editable = await getTwinSceneBandEditable(row.twinscene_slug);
      return NextResponse.json({ mode: 'edit', editable });
    } catch (error) {
      console.error('[admin/bands/twinscene/[bandId]] editable fetch failed', error);
      return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
    }
  }
  return NextResponse.json({ mode: 'create', editable: localToEditable(row) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { bandId } = await params;
  const id = Number(bandId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid band id' }, { status: 400 });
  }

  const row = await loadLocal(id);
  if (!row) {
    return NextResponse.json({ error: 'Band not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = s(body?.name) || row.name;
  const profile: TwinSceneBandInput = {
    genres: strArr(body?.genres),
    similarTo: strArr(body?.similarTo),
    city: s(body?.city),
    locality: s(body?.locality),
    neighborhoods: strArr(body?.neighborhoods),
    members: strArr(body?.members),
    contactEmail: s(body?.contactEmail),
    contactMethod: s(body?.contactMethod),
    website: s(body?.website),
    instagram: s(body?.instagram),
    facebook: s(body?.facebook),
    bandcamp: s(body?.bandcamp),
    bandcampLink: s(body?.bandcampLink),
    youtubeChannel: s(body?.youtubeChannel),
    bio: s(body?.bio),
    featuredLinks: linkArr(body?.featuredLinks),
    photoUrl: s(body?.photoUrl) || undefined,
  };

  // Resolve the canonical Twin Scene id to re-sync against: an existing linked
  // id, or a freshly-created one after pushing an unlinked local row up.
  let twinSceneId: number;
  try {
    if (row.twin_scene_band_id != null && row.twinscene_slug) {
      await updateTwinSceneBandFull(row.twinscene_slug, name, profile);
      twinSceneId = Number(row.twin_scene_band_id);
    } else {
      const created = await createTwinSceneBandFull(name, profile);
      // Link this exact local row in place (never create a duplicate overlay),
      // mirroring the push-to-twinscene action. Guard on the null link so a
      // concurrent link can't be overwritten.
      await sql`
        update bands
        set twin_scene_band_id = ${created.id}, twinscene_slug = ${created.slug},
          synced_at = now(), updated_at = now()
        where id = ${id} and twin_scene_band_id is null
      `;
      twinSceneId = created.id;
    }
  } catch (error) {
    console.error('[admin/bands/twinscene/[bandId]] Twin Scene write failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }

  // Re-pull the authoritative post-enrichment record and refresh the local
  // overlay (upsert on twin_scene_band_id updates this row in place).
  let match;
  try {
    const bands = await getTwinSceneBands();
    match = bands.find((b) => b.id === twinSceneId);
  } catch (error) {
    console.error('[admin/bands/twinscene/[bandId]] sync fetch failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }
  if (!match) {
    return NextResponse.json({ error: 'Updated band not found in Twin Scene' }, { status: 502 });
  }

  const band = await syncBandFromTwinScene(match);

  revalidatePath('/bands/[slug]', 'page');
  revalidatePath('/bands');

  return NextResponse.json({
    id: band.id,
    slug: band.slug,
    name: band.name,
    instagram: band.instagram ?? null,
    bio: band.bio ?? null,
    photo: band.photo ?? null,
  });
}
