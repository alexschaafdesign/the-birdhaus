import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { createTwinSceneBandFull, type TwinSceneBandInput } from '@/lib/twinscene';
import { requireAdmin } from '@/lib/admin-session';

// Push an existing, unlinked Birdhaus band up to Twin Scene and link the local
// overlay row in place (sets twin_scene_band_id) — without creating a duplicate
// row or touching the band's shows. This is the "Push to Twin Scene" admin
// action: it runs server-side (so TWIN_SCENE_API_KEY is available, unlike a
// local script) and is the counterpart to the Edit Show "Add band" modal for
// bands that already exist locally but predate the write-back.
//
// Body: { id } pushes that one band; no id pushes every unlinked band that has
// at least one show (skips bare orphans with no shows, which are cleaned up by
// deletion instead). Idempotent — an already-linked row is skipped.

interface BandRow {
  id: number;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  is_touring: boolean;
  genres: string[] | null;
  city: string | null;
  neighborhoods: string[] | null;
  members: string[] | null;
  contact_email: string | null;
  contact_method: string | null;
  website: string | null;
  bandcamp: string | null;
  featured_links: Array<{ url?: string; label?: string }> | null;
  twin_scene_band_id: string | number | null;
}

const SELECT_COLS = sql`
  id, name, instagram, bio, photo, is_touring, genres, city, neighborhoods,
  members, contact_email, contact_method, website, bandcamp, featured_links,
  twin_scene_band_id
`;

function toProfile(b: BandRow): TwinSceneBandInput {
  return {
    bio: b.bio ?? undefined,
    instagram: b.instagram ?? undefined,
    website: b.website ?? undefined,
    bandcamp: b.bandcamp ?? undefined,
    city: b.city ?? undefined,
    contactEmail: b.contact_email ?? undefined,
    contactMethod: b.contact_method ?? undefined,
    genres: b.genres ?? undefined,
    neighborhoods: b.neighborhoods ?? undefined,
    members: b.members ?? undefined,
    locality: b.is_touring ? 'touring' : undefined,
    photoUrl: b.photo ?? undefined,
    featuredLinks: (b.featured_links ?? [])
      .filter((l) => l && l.url)
      .map((l) => ({ url: l.url as string, label: l.label ?? '', image: '' })),
  };
}

async function pushOne(b: BandRow): Promise<{ name: string; tsId?: number; matched?: boolean; error?: string }> {
  if (b.twin_scene_band_id != null) return { name: b.name, error: 'already linked' };
  try {
    const created = await createTwinSceneBandFull(b.name, toProfile(b));
    await sql`
      update bands
      set twin_scene_band_id = ${created.id}, twinscene_slug = ${created.slug},
        synced_at = now(), updated_at = now()
      where id = ${b.id} and twin_scene_band_id is null
    `;
    return { name: b.name, tsId: created.id, matched: created.matched };
  } catch (error) {
    console.error('[admin/bands/push-to-twinscene] failed for', b.name, error);
    return { name: b.name, error: error instanceof Error ? error.message : 'failed' };
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: number } | null;

  let rows: BandRow[];
  if (body?.id != null) {
    rows = await sql<BandRow[]>`select ${SELECT_COLS} from bands where id = ${body.id}`;
  } else {
    // All unlinked bands that actually played a show — leaves bare orphans alone.
    rows = await sql<BandRow[]>`
      select ${SELECT_COLS} from bands b
      where b.twin_scene_band_id is null
        and exists (select 1 from show_bands sb where sb.band_id = b.id)
      order by b.name asc
    `;
  }

  const results = [];
  for (const row of rows) results.push(await pushOne(row));

  const linked = results.filter((r) => r.tsId != null);
  if (linked.length > 0) {
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/bands');
  }

  return NextResponse.json({
    total: results.length,
    linked: linked.length,
    failed: results.filter((r) => r.error && r.error !== 'already linked').length,
    results,
  });
}
