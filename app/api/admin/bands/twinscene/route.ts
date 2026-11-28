import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getTwinSceneBands } from '@/lib/twinscene';
import { importBandFromTwinScene } from '@/lib/bands';
import { requireAdmin } from '@/lib/admin-session';

// Read-only use of Twin Scene's directory (see lib/twinscene.ts).
//
// GET: fetched once per Edit Show form load (ShowForm.tsx) and filtered
// client-side by BandNameInput, so the typeahead can offer bands Birdhaus
// doesn't have yet. Best-effort: if Twin Scene is unreachable, the local
// typeahead (/api/admin/bands?q=) still works on its own.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
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

// POST: the operator picked a Twin-Scene-only typeahead result. Copy that
// band's public profile into a new Birdhaus row (a one-time copy, no ongoing
// sync) and hand back a real bandId for the show.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const twinSceneId = typeof body?.twinSceneId === 'number' ? body.twinSceneId : null;
  if (!twinSceneId) {
    return NextResponse.json({ error: 'twinSceneId is required' }, { status: 400 });
  }

  let twinSceneBands;
  try {
    twinSceneBands = await getTwinSceneBands();
  } catch (error) {
    console.error('[admin/bands/twinscene] import fetch failed', error);
    return NextResponse.json({ error: 'Twin Scene unavailable' }, { status: 502 });
  }

  const match = twinSceneBands.find((b) => b.id === twinSceneId);
  if (!match) {
    return NextResponse.json({ error: 'Band not found in Twin Scene' }, { status: 404 });
  }

  const band = await importBandFromTwinScene(match);

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
