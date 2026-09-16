import { NextResponse } from 'next/server';
import { getActiveTvImages } from '@/lib/tv-images';
import { getProgramOrBlank, getActiveCards, overrideActive, type TvProgram } from '@/lib/tv-program';
import { getCachedTvFeed } from '@/lib/tv-feed';
import { getPresetBoard } from '@/lib/tv-presets';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import { R2_PUBLIC_BASE } from '@/lib/r2-public';

export const dynamic = 'force-dynamic';

// Identifies the running deployment. Changes on every deploy, constant across a
// deployment's lifetime — so the kiosk can detect "new code shipped" from a
// poll and reload itself onto the new bundle (no manual Pi restart). 'dev'
// locally, where the bundle hot-reloads anyway.
const DEPLOY_VERSION =
  process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

// Feed for the in-venue CRT (/tv). Polled once a minute by a Pi that must never
// blank. The TV is now an authored CMS: this returns the PROGRAM (which mode is
// on the tube, via override / schedule / default) plus each mode's authored
// content. The client resolves the active mode against its own clock so a
// scheduled transition lands the moment it's due and the ?t preview works.
//
// Phase 1 serves the single global program. Phase 2 will prefer tonight's
// show's program.

// Venue day: 12:00–3:59am still counts as the previous calendar day, so the
// header date holds through a past-midnight set.
function getTvDateCentral(): string {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'America/Chicago',
  });
}

// The TV renders at 640px: Cloudinary URLs resize via URL transform; R2-hosted
// files route through /api/tv/img for a CDN-cached 640px JPEG; anything else
// passes through. null in -> null out.
function tvImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(`${R2_PUBLIC_BASE}/`)) {
    return `/api/tv/img?src=${encodeURIComponent(url.slice(R2_PUBLIC_BASE.length + 1))}`;
  }
  return cloudinaryTransform(url, 640);
}

export async function GET(request: Request) {
  const today = getTvDateCentral();

  // ?showId=N previews that show's program regardless of the date (used by the
  // admin preview). Absent -> normal operation: prefer tonight's show's program
  // over the global default. A show is "tonight" if it's dated today; the TV is
  // inside the venue during it, so no announced gate. The show program only
  // takes over once it has a row — otherwise the global default covers it.
  const previewParam = new URL(request.url).searchParams.get('showId');
  const previewShowId = previewParam && /^\d+$/.test(previewParam) ? Number(previewParam) : null;

  // ?presetId=N renders that board preset's run-of-show as the board content
  // (used by the admin "export PNG" of a saved schedule). Read-only preview —
  // it never touches the live tube. Non-board / missing ids fall through to the
  // normal board below.
  const presetParam = new URL(request.url).searchParams.get('presetId');
  const presetId = presetParam && /^\d+$/.test(presetParam) ? Number(presetParam) : null;
  const presetBoard = presetId !== null ? await getPresetBoard(presetId) : null;

  // The DB reads. Steady state (the kiosk polls with NO params) goes through
  // the Data Cache in getCachedTvFeed, so a normal poll touches no Postgres and
  // the Neon compute can idle-suspend. The ?showId admin preview needs an
  // arbitrary show's live program, so it bypasses the cache and reads directly
  // (rare, admin-only). Either way `program` stays raw here — the override is
  // resolved below, off-cache, against the current clock.
  let program: TvProgram;
  let cards: Array<{ headline: string; subtext: string | null; image: string | null }>;
  let poolImages: Array<{ url: string; caption: string | null }>;
  if (previewShowId !== null) {
    program = await getProgramOrBlank(previewShowId);
    [cards, poolImages] = await Promise.all([
      getActiveCards(previewShowId),
      getActiveTvImages(),
    ]);
  } else {
    const feed = await getCachedTvFeed(today);
    program = feed.program;
    cards = feed.cards;
    poolImages = feed.pool;
  }

  const body = {
    date: today,
    // Bundle version — the kiosk reloads itself when this changes (new deploy).
    version: DEPLOY_VERSION,
    // The program the client resolves the live mode from. An expired override
    // is dropped here so the tube stops honoring it without waiting on a manual
    // clear.
    program: {
      defaultMode: program.defaultMode,
      schedule: program.schedule,
      overrideMode: overrideActive(program) ? program.overrideMode : null,
    },
    // 'board' mode content — a ?presetId preview swaps in that saved preset's
    // run-of-show instead of the live board.
    board: presetBoard ?? {
      title: program.boardTitle,
      rows: program.boardRows,
    },
    // 'cards' mode content (announcement cards), images rewritten to the 640
    // variant; a card whose image doesn't resolve just renders text-only.
    cards: cards.map((c) => ({
      headline: c.headline,
      subtext: c.subtext,
      image: tvImage(c.image),
    })),
    // 'screensaver' mode content: the curated bounce pool. Kept under the name
    // `pool` so the identical-poll short-circuit is unchanged.
    pool: poolImages
      .map((img) => ({ url: tvImage(img.url), caption: img.caption }))
      .filter((img): img is { url: string; caption: string | null } => img.url !== null),
    // Transitional stubs: a kiosk still running the pre-CMS bundle validates its
    // payload on these two fields. Safe to drop once every Pi is on the new
    // build (it degrades to the screensaver/idle card until then).
    tonight: null,
    upcoming: [] as unknown[],
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
