import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { enrichBandsFromTwinScene } from '@/lib/bands';

// Nightly pull from Twin Scene's canonical band directory — fills empty fields
// on every Birdhaus band linked via twin_scene_band_id (fill-only-if-empty, so
// it never clobbers a Birdhaus edit). This is the automatic counterpart to the
// admin "Sync from Twin Scene" button (POST /api/admin/bands/sync-twinscene):
// linking a band and its Twin Scene profile being completed are two separate
// events, often days apart, so without this a profile filled in on Twin Scene
// after the link would never appear in Birdhaus until someone hit that button
// by hand. Scheduled by the `crons` entry in vercel.json. Like the timesheet
// cron, this route is NOT under /api/admin, so proxy.ts doesn't gate it — Vercel
// Cron sends `Authorization: Bearer <CRON_SECRET>`, which we require here so
// nobody else can trigger it.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await enrichBandsFromTwinScene();

  if (result.updated > 0) {
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/shows/[slug]', 'page');
    revalidatePath('/bands');
    revalidatePath('/shows');
  }

  return NextResponse.json({ ok: true, ...result });
}
