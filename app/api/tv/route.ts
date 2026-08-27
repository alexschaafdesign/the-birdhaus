import { NextResponse } from 'next/server';
import { getAllShows, ISO_DATE_RE, type Show } from '@/lib/shows';
import { getActiveTvImages } from '@/lib/tv-images';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import { R2_PUBLIC_BASE } from '@/lib/r2-public';

export const dynamic = 'force-dynamic';

// Feed for the in-venue CRT display (/tv). Polled once a minute by a TV that
// must never blank, so the response is a plain snapshot: tonight's show (if
// any) plus the next few announced shows. The TV holds its last good copy on
// any failure, so this route just answers honestly — no caching.

// "Tonight" in venue time, where the night runs until 4am: shifting the
// instant back 4 hours before asking Chicago what day it is makes
// 12:00–3:59am still count as the previous calendar day, so the TV keeps
// showing tonight's bill through a past-midnight set.
function getTvDateCentral(): string {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'America/Chicago',
  });
}

// The TV renders at 640px wide, so serve pre-resized files — the Pi should
// never decode a full-res image. Cloudinary URLs resize via URL transform;
// R2-hosted files (images.thebirdhaus.org) route through /api/tv/img, which
// serves a CDN-cached 640px JPEG. Anything else passes through untouched.
function tvImage(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(`${R2_PUBLIC_BASE}/`)) {
    return `/api/tv/img?src=${encodeURIComponent(url.slice(R2_PUBLIC_BASE.length + 1))}`;
  }
  return cloudinaryTransform(url, 640);
}

// shows.bands is either string[] (legacy) or band objects; flatten both into
// the shape the TV reads. setStart/setEnd are optional "HH:MM" venue-local
// times that drive the live set-time state machine — null when unset (most
// nights), which the TV treats as "no schedule, fall back to rotation".
function tvBands(bands: Show['bands']) {
  return (bands ?? []).map((band) =>
    typeof band === 'string'
      ? { name: band, photo: null, instagram: null, setStart: null, setEnd: null }
      : {
          name: band.name,
          photo: tvImage(band.photo),
          instagram: band.instagram ?? null,
          setStart: band.setStart ?? null,
          setEnd: band.setEnd ?? null,
        }
  );
}

export async function GET(request: Request) {
  const shows = await getAllShows();
  // Curated idle-pool images (069_tv_images.sql). The TV shows these only in
  // "dead air" (no show, before doors, after the last set) — the client decides
  // when — so the feed always carries them and lets the tube pick the moment.
  const poolImages = await getActiveTvImages();

  // ?date=YYYY-MM-DD previews any day as "tonight" (pair of the page's
  // ?scanlines=1 affordance). Simulated days only surface announced shows —
  // the no-announced-gate rule below is for the real tonight, where the show
  // is physically happening; it shouldn't let a guessed URL read drafts.
  const override = new URL(request.url).searchParams.get('date');
  const simulated = override !== null && ISO_DATE_RE.test(override);
  const today = simulated ? override : getTvDateCentral();

  // A row dated tonight is a show that's happening — the TV is inside the
  // venue during it, so don't gate on `announced` (that flag is about the
  // public site). Upcoming slides ARE public-facing teasers, so those do
  // filter to announced.
  const tonightShow =
    shows.find((show) => show.date === today && (!simulated || show.announced)) ?? null;
  const upcomingShows = shows
    .filter((show) => show.date > today && show.announced)
    .slice(0, 4);

  const body = {
    date: today,
    tonight: tonightShow
      ? {
          title: tonightShow.title,
          date: tonightShow.date,
          flyer: tvImage(tonightShow.flyer),
          doorsTime: tonightShow.doorsTime ?? null,
          showTime: tonightShow.showTime ?? null,
          bands: tvBands(tonightShow.bands),
        }
      : null,
    upcoming: upcomingShows.map((show) => ({
      title: show.title,
      date: show.date,
      flyer: tvImage(show.flyer),
      bands: tvBands(show.bands).map((band) => band.name),
    })),
    // Each pool image, its URL rewritten to the 640px Pi variant like every
    // other TV image. A row whose URL doesn't resolve to one is dropped rather
    // than shipped as a broken slide.
    pool: poolImages
      .map((img) => ({ url: tvImage(img.url), caption: img.caption }))
      .filter((img): img is { url: string; caption: string | null } => img.url !== null),
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
