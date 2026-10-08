// Combined calendar/list: house shows + Song Club events shown together as
// one "Upcoming Shows" table. This is a PRESENTATION-level union only — the two
// stay in separate tables (`shows` and `song_club_events`). Song Club events
// are adapted into the Show view-model for rendering; nothing is written into
// the `shows` table, so the Twin Scene scraper (which reads Birdhaus's `shows`)
// is unaffected. See ../twinscene/ARCHITECTURE.md for that boundary.
//
// This module deliberately does NOT import lib/song-club (feature code): the
// caller fetches the events and passes them in (see app/upcoming/page.tsx), so
// the shared calendar library carries no Song Club / portal dependency and is
// ready for the portal to move to its own app.

import type { Show } from './shows';

// The Song Club event fields the calendar adapter reads — a structural subset of
// lib/song-club's SongClubEvent, declared here so this module needs no import
// from feature code. listEvents({ publishedOnly: true }) returns compatible rows.
export interface CalendarEvent {
  id: number;
  slug: string;
  title: string;
  event_date: string; // "YYYY-MM-DD"
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  flyer_url: string | null;
  published: boolean;
}

// Adapts a Song Club event into the Show shape used by the calendar/list
// components. Only the fields those components read are populated; the rest
// take empty defaults. `announced` mirrors `published` so the upcoming filter
// (date >= today && announced) treats a published event as public.
export function songClubEventToShow(e: CalendarEvent): Show {
  const timeLine =
    e.start_time && e.end_time
      ? `${e.start_time}–${e.end_time}`
      : e.start_time || e.end_time || undefined;
  return {
    id: e.id,
    slug: e.slug,
    // Song Club events aren't house nights: no BH id, never a /shows/ page.
    catalogueId: '',
    status: 'scheduled',
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

// House shows plus the (published) Song Club events the caller passes in, in one
// array. Callers filter upcoming/past exactly as they already did for shows.
export function getCombinedShows(shows: Show[], events: CalendarEvent[]): Show[] {
  return [...shows, ...events.map(songClubEventToShow)];
}
