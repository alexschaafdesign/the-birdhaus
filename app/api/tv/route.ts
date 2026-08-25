import { NextResponse } from 'next/server';
import { getAllShows, ISO_DATE_RE, type Show } from '@/lib/shows';
import { cloudinaryTransform } from '@/lib/cloudinary-url';

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

// The TV renders at 640px wide, so serve pre-resized Cloudinary files — the
// Pi should never decode a full-res flyer. No-op for non-Cloudinary URLs.
function tvImage(url: string | undefined): string | null {
  return url ? cloudinaryTransform(url, 640) : null;
}

// shows.bands is either string[] (legacy) or band objects; flatten both into
// the shape the TV reads.
function tvBands(bands: Show['bands']) {
  return (bands ?? []).map((band) =>
    typeof band === 'string'
      ? { name: band, photo: null, instagram: null }
      : {
          name: band.name,
          photo: tvImage(band.photo),
          instagram: band.instagram ?? null,
        }
  );
}

export async function GET(request: Request) {
  const shows = await getAllShows();

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
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
