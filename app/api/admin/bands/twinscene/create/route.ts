import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getTwinSceneBands, createTwinSceneBandFull, type TwinSceneBandInput } from '@/lib/twinscene';
import { syncBandFromTwinScene } from '@/lib/bands';

// Full "Add band" from the Edit Show form's typeahead modal: create the band in
// Twin Scene's canonical directory with a complete profile, then create the
// local overlay row linked to it and hand back a real bands.id the show can
// link like any other match. The sibling POST /api/admin/bands/twinscene is the
// JIT sync for picking an *existing* Twin Scene band; this is the create path.
//
// After the create, Twin Scene's returned id is resolved against a fresh
// directory pull (there's no per-id lookup upstream) and run through the same
// syncBandFromTwinScene the JIT route uses — so the local row carries Twin
// Scene's authoritative, post-enrichment field values (e.g. resolved Bandcamp
// embed) rather than just the raw form input.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const str = (v: unknown): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s || undefined;
  };
  const list = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const arr = v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr : undefined;
  };
  const links = (v: unknown): TwinSceneBandInput['featuredLinks'] => {
    if (!Array.isArray(v)) return undefined;
    const arr = v
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({ url: str(l.url) ?? '', label: str(l.label) ?? '', image: '' }))
      .filter((l) => l.url);
    return arr.length ? arr : undefined;
  };

  const profile: TwinSceneBandInput = {
    genres: list(body?.genres),
    similarTo: list(body?.similarTo),
    city: str(body?.city),
    locality: str(body?.locality),
    neighborhoods: list(body?.neighborhoods),
    members: list(body?.members),
    contactEmail: str(body?.contactEmail),
    contactMethod: str(body?.contactMethod),
    website: str(body?.website),
    instagram: str(body?.instagram),
    bandcamp: str(body?.bandcamp),
    bandcampLink: str(body?.bandcampLink),
    youtubeChannel: str(body?.youtubeChannel),
    bio: str(body?.bio),
    featuredLinks: links(body?.featuredLinks),
    photoUrl: str(body?.photoUrl),
  };

  let created;
  try {
    created = await createTwinSceneBandFull(name, profile);
  } catch (error) {
    console.error('[admin/bands/twinscene/create] Twin Scene create failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }

  let twinSceneBands;
  try {
    twinSceneBands = await getTwinSceneBands();
  } catch (error) {
    console.error('[admin/bands/twinscene/create] sync fetch failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }

  const match = twinSceneBands.find((b) => b.id === created.id);
  if (!match) {
    return NextResponse.json({ error: 'Created band not found in Twin Scene' }, { status: 502 });
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
