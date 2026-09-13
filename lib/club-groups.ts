// Song Club groups — a song-a-day event split into small groups, each with its
// own page, board, and day-by-day song list. A track's group is DERIVED at
// query time from its uploader's group_id on song_club_event_attendees (see
// migration 083): moving a person between groups moves all their songs with
// no track-level writes. Callers authenticate first; this module is data only.

import { sql } from './db';
import { slugify } from './song-club';

export interface ClubGroup {
  id: number;
  eventId: number;
  name: string;
  position: number;
  slug: string; // stored at creation (migration 085), never rewritten on rename
  memberCount: number;
}

const GROUP_NAMES = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F'];

interface GroupRow {
  id: number;
  event_id: number;
  name: string;
  position: number;
  slug: string;
  member_count: number;
}

function mapGroup(r: GroupRow): ClubGroup {
  return {
    id: Number(r.id),
    eventId: Number(r.event_id),
    name: r.name,
    position: Number(r.position),
    slug: r.slug,
    memberCount: Number(r.member_count),
  };
}

export async function listGroups(eventId: number): Promise<ClubGroup[]> {
  const rows = await sql<GroupRow[]>`
    select g.id, g.event_id, g.name, g.position, g.slug,
           (select count(*)::int from song_club_event_attendees a
             where a.group_id = g.id) as member_count
    from song_club_groups g
    where g.event_id = ${eventId}
    order by g.position asc
  `;
  return rows.map(mapGroup);
}

// Group pages address groups by their stored slug. It's fixed at creation, so
// a rename never changes the URL and never breaks links already shared.
export async function getGroupBySlug(eventId: number, slug: string): Promise<ClubGroup | null> {
  const groups = await listGroups(eventId);
  return groups.find((g) => g.slug === slug) ?? null;
}

export async function getGroup(id: number): Promise<ClubGroup | null> {
  const rows = await sql<GroupRow[]>`
    select g.id, g.event_id, g.name, g.position, g.slug,
           (select count(*)::int from song_club_event_attendees a
             where a.group_id = g.id) as member_count
    from song_club_groups g where g.id = ${id}
  `;
  return rows[0] ? mapGroup(rows[0]) : null;
}

// Create the event's groups in one go, auto-named Group A…. No-ops (returns
// the existing set) if the event already has groups — the admin UI offers
// creation only when there are none.
//
// A group always collects songs, so making the event's first group also
// ensures the event has a (locked, uploads-closed) playlist — created and
// linked in the SAME transaction as the groups. Pass ensurePlaylistTitle (the
// event title) to enable this; if the event already has a playlist it's a
// no-op, leaving existing events untouched.
export async function createGroups(
  eventId: number,
  count: number,
  ensurePlaylistTitle?: string
): Promise<ClubGroup[]> {
  const n = Math.max(2, Math.min(GROUP_NAMES.length, Math.floor(count)));
  const existing = await listGroups(eventId);
  if (existing.length > 0) return existing;
  await sql.begin(async (tx) => {
    if (ensurePlaylistTitle !== undefined) {
      const [ev] = await tx<Array<{ playlist_id: number | null }>>`
        select playlist_id from song_club_events where id = ${eventId} for update
      `;
      if (ev && ev.playlist_id == null) {
        const title = ensurePlaylistTitle.trim().slice(0, 200) || 'Songs';
        const [pl] = await tx<Array<{ id: number }>>`
          insert into song_club_playlists (title, locked) values (${title}, true)
          returning id
        `;
        await tx`update song_club_events set playlist_id = ${pl.id} where id = ${eventId}`;
      }
    }
    for (let i = 0; i < n; i++) {
      await tx`
        insert into song_club_groups (event_id, name, position, slug)
        values (${eventId}, ${GROUP_NAMES[i]}, ${i + 1}, ${slugify(GROUP_NAMES[i])})
        on conflict (event_id, position) do nothing
      `;
    }
  });
  return listGroups(eventId);
}

// Remove a group. Nothing is deleted beyond the group row itself: its members'
// group_id resets to null (the FK is ON DELETE SET NULL, migration 083), so
// they become unassigned and — because a track's group is DERIVED from its
// uploader's group_id — their songs move to the Unassigned section.
//
// BUT the posts FK is also ON DELETE SET NULL, which would silently relocate
// the group's private board chat onto the event-wide announcement board. We
// refuse rather than do that: a group with any board posts can't be removed
// until the posts are cleared. Returns { ok:false, postCount } in that case so
// the caller can explain why; { ok:true, freed } (member count) on success.
export async function deleteGroup(
  eventId: number,
  groupId: number
): Promise<{ ok: true; freed: number } | { ok: false; reason: 'not_found' | 'has_posts'; postCount: number }> {
  const [g] = await sql<Array<{ member_count: number; post_count: number }>>`
    select (
      select count(*)::int from song_club_event_attendees a where a.group_id = ${groupId}
    ) as member_count,
    (
      select count(*)::int from song_club_posts p where p.group_id = ${groupId}
    ) as post_count
    from song_club_groups where id = ${groupId} and event_id = ${eventId}
  `;
  if (!g) return { ok: false, reason: 'not_found', postCount: 0 };
  if (Number(g.post_count) > 0) {
    return { ok: false, reason: 'has_posts', postCount: Number(g.post_count) };
  }
  await sql`delete from song_club_groups where id = ${groupId} and event_id = ${eventId}`;
  return { ok: true, freed: Number(g.member_count) };
}

// The viewer's group for an event (null = unassigned or not an attendee).
export async function getAttendeeGroupId(eventId: number, userId: number): Promise<number | null> {
  const [row] = await sql<Array<{ group_id: number | null }>>`
    select group_id from song_club_event_attendees
    where event_id = ${eventId} and user_id = ${userId}
  `;
  return row?.group_id == null ? null : Number(row.group_id);
}

// Assign (or unassign, groupId null) one attendee. The group must belong to
// the same event — re-derived here, never trusted from the client.
export async function assignAttendeeGroup(
  eventId: number,
  userId: number,
  groupId: number | null
): Promise<boolean> {
  if (groupId !== null) {
    const [g] = await sql<Array<{ one: number }>>`
      select 1 as one from song_club_groups
      where id = ${groupId} and event_id = ${eventId}
    `;
    if (!g) return false;
  }
  const result = await sql`
    update song_club_event_attendees set group_id = ${groupId}
    where event_id = ${eventId} and user_id = ${userId}
  `;
  return result.count > 0;
}

// Spread attendees with a null group_id across the event's groups, always
// filling the currently-smallest group first so re-running as late signups
// arrive keeps things balanced. Never touches an already-assigned attendee.
export async function distributeUnassigned(eventId: number): Promise<number> {
  const groups = await listGroups(eventId);
  if (groups.length === 0) return 0;
  const unassigned = await sql<Array<{ user_id: number }>>`
    select user_id from song_club_event_attendees
    where event_id = ${eventId} and group_id is null
    order by added_at asc, user_id asc
  `;
  const counts = new Map(groups.map((g) => [g.id, g.memberCount]));
  let assigned = 0;
  for (const row of unassigned) {
    let target = groups[0].id;
    for (const g of groups) {
      if ((counts.get(g.id) ?? 0) < (counts.get(target) ?? 0)) target = g.id;
    }
    const result = await sql`
      update song_club_event_attendees set group_id = ${target}
      where event_id = ${eventId} and user_id = ${Number(row.user_id)} and group_id is null
    `;
    if (result.count > 0) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
      assigned++;
    }
  }
  return assigned;
}

export interface GroupRosterEntry {
  userId: number;
  name: string;
  avatarUrl: string | null;
  groupId: number | null;
}

// Every attendee of the event with their group, for group-page rosters and
// the admin assignment panel.
export async function listGroupRoster(eventId: number): Promise<GroupRosterEntry[]> {
  const rows = await sql<
    Array<{ user_id: number; name: string; avatar_url: string | null; group_id: number | null }>
  >`
    select a.user_id, u.name, u.avatar_url, a.group_id
    from song_club_event_attendees a
    join users u on u.id = a.user_id
    where a.event_id = ${eventId}
    order by u.name asc, u.id asc
  `;
  return rows.map((r) => ({
    userId: Number(r.user_id),
    name: r.name,
    avatarUrl: r.avatar_url,
    groupId: r.group_id == null ? null : Number(r.group_id),
  }));
}
