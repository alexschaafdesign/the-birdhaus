import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { enrichBandsFromTwinScene } from '@/lib/bands';

// Admin-triggered pull from Twin Scene's canonical band directory — fills
// empty fields on every Birdhaus band linked via twin_scene_band_id. See
// enrichBandsFromTwinScene() for why this is a pull rather than Twin Scene
// pushing to Birdhaus.
export async function POST() {
  const result = await enrichBandsFromTwinScene();

  if (result.updated > 0) {
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/shows/[slug]', 'page');
    revalidatePath('/bands');
    revalidatePath('/shows');
  }

  return NextResponse.json(result);
}
