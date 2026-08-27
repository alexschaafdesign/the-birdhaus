import { NextResponse } from 'next/server';
import { getActiveTvImages } from '@/lib/tv-images';
import { getGlobalProgram, getGlobalCards } from '@/lib/tv-program';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import { R2_PUBLIC_BASE } from '@/lib/r2-public';

export const dynamic = 'force-dynamic';

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

export async function GET() {
  const [program, cards, poolImages] = await Promise.all([
    getGlobalProgram(),
    getGlobalCards(),
    getActiveTvImages(),
  ]);

  const body = {
    date: getTvDateCentral(),
    // The program the client resolves the live mode from.
    program: {
      defaultMode: program.defaultMode,
      schedule: program.schedule,
      overrideMode: program.overrideMode,
    },
    // 'board' mode content.
    board: {
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
