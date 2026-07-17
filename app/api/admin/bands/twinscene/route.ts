import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getTwinSceneBands } from '@/lib/twinscene';
import { syncBandFromTwinScene } from '@/lib/bands';

// Fetched once per Edit Show form load (see ShowForm.tsx) and cached
// client-side for the rest of the session — BandNameInput filters this list
// locally on every keystroke rather than re-fetching. Best-effort: if Twin
// Scene is unreachable, the form's local-only typeahead (/api/admin/bands)
// still works on its own.
export async function GET() {
  try {
    const bands = await getTwinSceneBands();
    return NextResponse.json(
      bands.map((b) => ({
        twinSceneId: b.id,
        name: b.name,
        instagram: b.socials.instagram ?? null,
        bio: b.bio || null,
        photo: b.photo || null,
      }))
    );
  } catch (error) {
    console.error('[admin/bands/twinscene] fetch failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }
}

// Just-in-time sync: the operator selected a Twin-Scene-only typeahead result
// with no local bands row yet. Re-fetches Twin Scene's directory (there's no
// per-id lookup upstream) for authoritative field values, creates (or, on a
// race, updates) the local overlay row, and hands back a real bandId so the
// show can link to it like any other match. Distinct from the bulk
// enrichment pull at POST /api/admin/bands/sync-twinscene, which only fills
// gaps on bands already linked — this is the one-time create path.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const twinSceneId = typeof body?.twinSceneId === 'number' ? body.twinSceneId : null;
  if (!twinSceneId) {
    return NextResponse.json({ error: 'twinSceneId is required' }, { status: 400 });
  }

  let twinSceneBands;
  try {
    twinSceneBands = await getTwinSceneBands();
  } catch (error) {
    console.error('[admin/bands/twinscene] sync fetch failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }

  const match = twinSceneBands.find((b) => b.id === twinSceneId);
  if (!match) {
    return NextResponse.json({ error: 'Band not found in Twin Scene' }, { status: 404 });
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
