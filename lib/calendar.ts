// Combined calendar/list: house shows + Song Club events shown together as
// one "Upcoming Shows" table. This is a PRESENTATION-level union only — the two
// stay in separate tables (`shows` and `song_club_events`). Song Club events
// are adapted into the Show view-model for rendering; nothing is written into
// the `shows` table, so the Twin Scene scraper (which reads Birdhaus's `shows`)
// is unaffected. See ../twinscene/ARCHITECTURE.md for that boundary.

import { getAllShows, type Show } from './shows';
import { listEvents, type SongClubEvent } from './song-club';

// Adapts a Song Club event into the Show shape used by the calendar/list
// components. Only the fields those components read are populated; the rest
// take empty defaults. `announced` mirrors `published` so the upcoming filter
// (date >= today && announced) treats a published event as public.
export function songClubEventToShow(e: SongClubEvent): Show {
  const timeLine =
    e.start_time && e.end_time
      ? `${e.start_time}–${e.end_time}`
      : e.start_time || e.end_time || undefined;
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    date: e.event_date,
    doorsTime: timeLine,
    flyer: e.flyer_url ?? undefined,
    bands: [],
    videos: [],
    content: '',
    announced: e.published,
    targetBandCount: 0,
    ignoredHealthChecks: [],
    type: 'song_club',
    subtitle: e.venue_name ?? 'Song Club',
  };
}

// All shows (any announced state, for the admin draft overlay) plus PUBLISHED
// Song Club events, in one array. Callers filter upcoming/past exactly as they
// already did for shows.
export async function getCombinedShows(): Promise<Show[]> {
  const [shows, events] = await Promise.all([
    getAllShows(),
    listEvents({ publishedOnly: true }),
  ]);
  return [...shows, ...events.map(songClubEventToShow)];
}
