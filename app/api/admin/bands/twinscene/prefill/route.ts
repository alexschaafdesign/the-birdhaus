import { NextResponse } from 'next/server';
import { findTwinSceneBandByName } from '@/lib/twinscene';
import { requireAdmin } from '@/lib/admin-session';

// "Prefill from Twin Scene" in the band forms: look a band up by exact name
// (case-insensitive) and return the fields Birdhaus's band form uses. Read-only;
// the form decides what to copy, and nothing is saved until the form is.
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const name = new URL(request.url).searchParams.get('name')?.trim() ?? '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  let band;
  try {
    band = await findTwinSceneBandByName(name);
  } catch (error) {
    console.error('[admin/bands/twinscene/prefill] fetch failed', error);
    return NextResponse.json({ error: 'Twin Scene is unavailable right now.' }, { status: 502 });
  }
  if (!band) {
    return NextResponse.json({ error: `No band named “${name}” on Twin Scene.` }, { status: 404 });
  }

  return NextResponse.json({
    name: band.name,
    instagram: band.socials.instagram ?? '',
    bio: band.bio,
    photo: band.photo,
    twinsceneSlug: band.slug,
  });
}
