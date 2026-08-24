// Portal event hubs: the Event is the organizing unit. Each event gathers its
// round (music), its attendee roster (admin-curated), and its own message
// board. Callers authenticate first (portal member or admin session).

import { sql } from './db';
import type { ProfileLink } from './club-members';

export interface PortalEvent {
  id: number;
  slug: string;
  title: string;
  eventDate: string;
  flyerUrl: string | null;
  published: boolean;
  playlistId: number | null;
  trackCount: number;
  attendeeCount: number;
}

export interface AttendeeCard {
  id: number;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  links: ProfileLink[];
}

// Events shown on the portal home, newest first. Admins see drafts too.
export async function listPortalEvents(includeDrafts: boolean): Promise<PortalEvent[]> {
  const rows = await sql<
    Array<{
      id: number;
      slug: string;
      title: string;
      event_date: string;
      flyer_url: string | null;
      published: boolean;
      playlist_id: number | null;
      track_count: number;
      attendee_count: number;
    }>
  >`
    select e.id, e.slug, e.title, e.event_date::text as event_date, e.flyer_url,
           e.published, e.playlist_id,
           coalesce((select count(*)::int from song_club_playlist_tracks pt
             where pt.playlist_id = e.playlist_id), 0) as track_count,
           (select count(*)::int from song_club_event_attendees a
             where a.event_id = e.id) as attendee_count
    from song_club_events e
    ${includeDrafts ? sql`` : sql`where e.published = true`}
    order by e.event_date desc, e.id desc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    title: r.title,
    eventDate: r.event_date,
    flyerUrl: r.flyer_url,
    published: r.published,
    playlistId: r.playlist_id === null ? null : Number(r.playlist_id),
    trackCount: Number(r.track_count),
    attendeeCount: Number(r.attendee_count),
  }));
}

// Attendee profile cards for an event.
export async function getEventAttendees(eventId: number): Promise<AttendeeCard[]> {
  const rows = await sql<
    Array<{ id: number; name: string; avatar_url: string | null; bio: string | null; links: ProfileLink[] }>
  >`
    select u.id, u.name, u.avatar_url, u.bio, u.links
    from song_club_event_attendees a
    join users u on u.id = a.user_id
    where a.event_id = ${eventId}
    order by u.name asc, u.id asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    links: Array.isArray(r.links) ? r.links : [],
  }));
}

// Active members not yet on this event's roster — the admin's "add attendee"
// picker.
export async function getAddableMembers(
  eventId: number
): Promise<Array<{ id: number; name: string; email: string }>> {
  return sql<Array<{ id: number; name: string; email: string }>>`
    select u.id, u.name, u.email
    from users u
    join user_roles r on r.user_id = u.id and r.role = 'song_club'
    where u.status = 'active'
      and not exists (
        select 1 from song_club_event_attendees a
        where a.event_id = ${eventId} and a.user_id = u.id
      )
    order by u.name asc
  `;
}

// Links a round (playlist) to an event as its round. Admin-gated by callers.
export async function setEventRound(eventId: number, playlistId: number): Promise<boolean> {
  const result = await sql`
    update song_club_events set playlist_id = ${playlistId} where id = ${eventId}
  `;
  return result.count > 0;
}

export async function isEventAttendee(eventId: number, userId: number): Promise<boolean> {
  const [row] = await sql<Array<{ one: number }>>`
    select 1 as one from song_club_event_attendees
    where event_id = ${eventId} and user_id = ${userId}
  `;
  return !!row;
}

export async function addAttendee(eventId: number, userId: number): Promise<boolean> {
  const result = await sql`
    insert into song_club_event_attendees (event_id, user_id)
    values (${eventId}, ${userId})
    on conflict do nothing
  `;
  return result.count > 0;
}

export async function removeAttendee(eventId: number, userId: number): Promise<boolean> {
  const result = await sql`
    delete from song_club_event_attendees
    where event_id = ${eventId} and user_id = ${userId}
  `;
  return result.count > 0;
}
