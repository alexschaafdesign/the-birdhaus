// Song Club music — the native replacement for Samply. Members upload tracks
// (audio in R2, uploaded direct via presigned URLs), the admin curates
// playlists ("rounds"), and comments hang off the TRACK so feedback follows a
// song wherever it appears. Callers authenticate first (getClubActor); this
// module only does data + ownership checks.

import { sql } from './db';
import type { ClubActor } from './club-members';
import { isClubReactionEmoji, type ClubReaction } from './club-reactions';

export interface ClubTrack {
  id: number;
  memberId: number | null;
  fromAdmin: boolean;
  uploaderName: string;
  title: string;
  notes: string | null;
  url: string;
  peaks: number[] | null;
  durationSeconds: number | null;
  createdAt: string;
  commentCount: number;
  // Round-scoped (from song_club_playlist_tracks): which song-a-day day the
  // track was filed under, and the admin's highlight star. null/false outside
  // a round context (standalone/single-track queries).
  day: string | null;
  isHighlight: boolean;
}

export interface ClubPlaylist {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  locked: boolean;
  trackCount: number;
  createdAt: string;
}

export interface ClubTrackComment {
  id: number;
  trackId: number;
  memberId: number | null;
  fromAdmin: boolean;
  authorName: string;
  avatarUrl: string | null;
  body: string;
  timestampSeconds: number | null;
  createdAt: string;
  reactions: ClubReaction[];
}

const MAX_COMMENT_LENGTH = 5000;

// Reactions for a set of comments, grouped per comment then per emoji (both
// in first-seen order). Used by trackComments and playlistComments.
async function reactionsForComments(
  commentIds: number[]
): Promise<Map<number, ClubReaction[]>> {
  const map = new Map<number, ClubReaction[]>();
  if (commentIds.length === 0) return map;
  const rows = await sql<
    Array<{ comment_id: number; emoji: string; member_id: number | null; member_name: string | null }>
  >`
    select r.comment_id, r.emoji, r.member_id, m.name as member_name
    from song_club_comment_reactions r
    left join users m on m.id = r.member_id
    where r.comment_id = any(${commentIds})
    order by r.created_at asc, r.id asc
  `;
  for (const r of rows) {
    const commentId = Number(r.comment_id);
    const list = map.get(commentId) ?? [];
    if (!map.has(commentId)) map.set(commentId, list);
    let bucket = list.find((b) => b.emoji === r.emoji);
    if (!bucket) {
      bucket = { emoji: r.emoji, reactors: [] };
      list.push(bucket);
    }
    bucket.reactors.push({
      memberId: r.member_id === null ? null : Number(r.member_id),
      name: r.member_id === null ? 'the Birdhaus' : r.member_name ?? 'Former member',
    });
  }
  return map;
}

interface TrackRow {
  id: number;
  member_id: number | null;
  from_admin: boolean;
  member_name: string | null;
  title: string;
  notes: string | null;
  url: string | null;
  r2_key: string | null;
  peaks: number[] | null;
  duration_seconds: number | null;
  created_at: string;
  comment_count: number;
  day?: string | null;
  is_highlight?: boolean;
}

const TRACK_SELECT = sql`
  select t.id, t.member_id, t.from_admin, m.name as member_name, t.title,
         t.notes, t.url, t.r2_key, t.peaks, t.duration_seconds, t.created_at::text as created_at,
         (select count(*)::int from song_club_track_comments c where c.track_id = t.id)
           as comment_count
  from song_club_tracks t
  left join users m on m.id = t.member_id
`;

// Same, plus the round-scoped columns — for queries that join
// song_club_playlist_tracks as `pt` (day + highlight live on the join row).
const TRACK_SELECT_IN_ROUND = sql`
  select t.id, t.member_id, t.from_admin, m.name as member_name, t.title,
         t.notes, t.url, t.r2_key, t.peaks, t.duration_seconds, t.created_at::text as created_at,
         pt.day::text as day, pt.is_highlight,
         (select count(*)::int from song_club_track_comments c where c.track_id = t.id)
           as comment_count
  from song_club_tracks t
  left join users m on m.id = t.member_id
`;

function mapTrack(r: TrackRow): ClubTrack {
  return {
    id: Number(r.id),
    memberId: r.member_id === null ? null : Number(r.member_id),
    fromAdmin: r.from_admin,
    uploaderName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
    title: r.title,
    notes: r.notes,
    // Migrated tracks play through the session-gated route (which 302s to a
    // presigned GET on the private bucket); un-migrated ones fall back to the
    // legacy public URL so nothing breaks mid-migration.
    url: r.r2_key ? `/api/club/audio/${Number(r.id)}` : r.url ?? '',
    peaks: Array.isArray(r.peaks) ? r.peaks : null,
    durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    createdAt: r.created_at,
    commentCount: Number(r.comment_count),
    day: r.day ?? null,
    isHighlight: r.is_highlight === true,
  };
}

// --- playlists (admin-created only; the routes enforce it) ---

interface PlaylistRow {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  locked: boolean;
  track_count: number;
  created_at: string;
}

const PLAYLIST_SELECT = sql`
  select p.id, p.title, p.description, p.image_url, p.locked,
         (select count(*)::int from song_club_playlist_tracks pt
           where pt.playlist_id = p.id) as track_count,
         p.created_at::text as created_at
  from song_club_playlists p
`;

function mapPlaylist(r: PlaylistRow): ClubPlaylist {
  return {
    id: Number(r.id),
    title: r.title,
    description: r.description,
    imageUrl: r.image_url,
    locked: r.locked,
    trackCount: Number(r.track_count),
    createdAt: r.created_at,
  };
}

export async function listPlaylists(): Promise<ClubPlaylist[]> {
  const rows = await sql<PlaylistRow[]>`
    ${PLAYLIST_SELECT} order by p.created_at desc, p.id desc
  `;
  return rows.map(mapPlaylist);
}

export async function getPlaylist(id: number): Promise<ClubPlaylist | null> {
  const [r] = await sql<PlaylistRow[]>`${PLAYLIST_SELECT} where p.id = ${id}`;
  return r ? mapPlaylist(r) : null;
}

// Rounds not linked from any event — the "Music" section on the portal home
// (event-linked rounds appear under their event instead).
export async function listStandaloneRounds(): Promise<ClubPlaylist[]> {
  const rows = await sql<PlaylistRow[]>`
    ${PLAYLIST_SELECT}
    where not exists (
      select 1 from song_club_events e where e.playlist_id = p.id
    )
    order by p.created_at desc, p.id desc
  `;
  return rows.map(mapPlaylist);
}

// The event (if any) that links to this round — its flyer is the round's
// cover, and its date range drives the upload form's day picker.
export async function getRoundEvent(playlistId: number): Promise<{
  id: number;
  slug: string;
  title: string;
  flyerUrl: string | null;
  eventDate: string;
  endDate: string | null;
} | null> {
  const [r] = await sql<
    Array<{
      id: number;
      slug: string;
      title: string;
      flyer_url: string | null;
      event_date: string;
      end_date: string | null;
    }>
  >`
    select id, slug, title, flyer_url, event_date::text as event_date,
           end_date::text as end_date
    from song_club_events
    where playlist_id = ${playlistId}
    order by id asc limit 1
  `;
  return r
    ? {
        id: Number(r.id),
        slug: r.slug,
        title: r.title,
        flyerUrl: r.flyer_url,
        eventDate: r.event_date,
        endDate: r.end_date,
      }
    : null;
}

// Date ranges of every event-linked round, keyed by playlist id — drives the
// upload form's day picker (rounds without an event get no picker).
export async function listRoundEventRanges(): Promise<
  Record<number, { start: string; end: string }>
> {
  const rows = await sql<Array<{ playlist_id: number; start_day: string; end_day: string }>>`
    select playlist_id, event_date::text as start_day,
           coalesce(end_date, event_date)::text as end_day
    from song_club_events
    where playlist_id is not null
  `;
  const ranges: Record<number, { start: string; end: string }> = {};
  for (const r of rows) {
    ranges[Number(r.playlist_id)] = { start: r.start_day, end: r.end_day };
  }
  return ranges;
}

export async function createPlaylist(input: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  locked?: boolean;
}): Promise<ClubPlaylist | null> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return null;
  const description = input.description?.trim().slice(0, 2000) || null;
  const [row] = await sql<Array<{ id: number }>>`
    insert into song_club_playlists (title, description, image_url, locked)
    values (${title}, ${description}, ${input.imageUrl?.trim() || null}, ${input.locked === true})
    returning id
  `;
  return getPlaylist(Number(row.id));
}

// Admin-only (routes enforce it): open/lock a round's uploads.
export async function setPlaylistLocked(id: number, locked: boolean): Promise<boolean> {
  const result = await sql`update song_club_playlists set locked = ${locked} where id = ${id}`;
  return result.count > 0;
}

// Deleting a playlist only removes the grouping — its tracks live on (they
// show up under Singles if they're in no other round).
export async function deletePlaylist(id: number): Promise<boolean> {
  const result = await sql`delete from song_club_playlists where id = ${id}`;
  return result.count > 0;
}

export async function updatePlaylist(
  id: number,
  input: { title?: string; description?: string | null; imageUrl?: string | null }
): Promise<boolean> {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : null;
  const hasDescription = input.description !== undefined;
  const description = input.description?.trim().slice(0, 2000) || null;
  const hasImage = input.imageUrl !== undefined;
  const imageUrl = input.imageUrl?.trim() || null;
  const result = await sql`
    update song_club_playlists set
      title = coalesce(${title}, title),
      description = ${hasDescription ? description : sql`description`},
      image_url = ${hasImage ? imageUrl : sql`image_url`}
    where id = ${id}
  `;
  return result.count > 0;
}

// --- tracks ---

export async function playlistTracks(playlistId: number): Promise<ClubTrack[]> {
  const rows = await sql<TrackRow[]>`
    ${TRACK_SELECT_IN_ROUND}
    join song_club_playlist_tracks pt on pt.track_id = t.id
    where pt.playlist_id = ${playlistId}
    order by pt.position asc, t.id asc
  `;
  return rows.map(mapTrack);
}

// A group's slice of an event round. The group is DERIVED from each track's
// uploader: their group_id on song_club_event_attendees for this event.
// groupId null = the "unassigned" slice — uploaders with no group yet, plus
// tracks whose uploader isn't (or is no longer) on the roster, so nothing is
// ever invisible. Ordered for day-header rendering: day ascending (undated
// last), then round position.
export async function playlistTracksByGroup(
  playlistId: number,
  eventId: number,
  groupId: number | null
): Promise<ClubTrack[]> {
  const rows = await sql<TrackRow[]>`
    ${TRACK_SELECT_IN_ROUND}
    join song_club_playlist_tracks pt on pt.track_id = t.id
    left join song_club_event_attendees a
      on a.user_id = t.member_id and a.event_id = ${eventId}
    where pt.playlist_id = ${playlistId}
      and ${groupId === null ? sql`a.group_id is null` : sql`a.group_id = ${groupId}`}
    order by pt.day asc nulls last, pt.position asc, t.id asc
  `;
  return rows.map(mapTrack);
}

// Per-group song tallies for the event page's group directory: total tracks
// in the round, and how many landed "today" (caller passes the Central date —
// getTodayCentral()). A track's group is derived from its uploader's attendee
// row, same as playlistTracksByGroup.
export async function groupTrackCounts(
  playlistId: number,
  eventId: number,
  todayCentral: string
): Promise<Map<number, { total: number; today: number }>> {
  const rows = await sql<Array<{ group_id: number; total: number; today: number }>>`
    select a.group_id, count(*)::int as total,
           count(*) filter (
             where (t.created_at at time zone 'America/Chicago')::date = ${todayCentral}::date
           )::int as today
    from song_club_tracks t
    join song_club_playlist_tracks pt on pt.track_id = t.id
    join song_club_event_attendees a
      on a.user_id = t.member_id and a.event_id = ${eventId}
    where pt.playlist_id = ${playlistId} and a.group_id is not null
    group by a.group_id
  `;
  return new Map(
    rows.map((r) => [Number(r.group_id), { total: Number(r.total), today: Number(r.today) }])
  );
}

// Songs filed per day of a round (pt.day), keyed YYYY-MM-DD — feeds the
// event page's day-strip tracker. Tracks without a day are simply absent.
export async function playlistDayCounts(playlistId: number): Promise<Record<string, number>> {
  const rows = await sql<Array<{ day: string; n: number }>>`
    select pt.day::text as day, count(*)::int as n
    from song_club_playlist_tracks pt
    where pt.playlist_id = ${playlistId} and pt.day is not null
    group by pt.day
  `;
  return Object.fromEntries(rows.map((r) => [r.day, Number(r.n)]));
}

// Like playlistDayCounts, but only tracks from ONE group's members — the
// group page's day strip. Group derivation matches playlistTracksByGroup.
export async function groupDayCounts(
  playlistId: number,
  eventId: number,
  groupId: number
): Promise<Record<string, number>> {
  const rows = await sql<Array<{ day: string; n: number }>>`
    select pt.day::text as day, count(*)::int as n
    from song_club_playlist_tracks pt
    join song_club_tracks t on t.id = pt.track_id
    join song_club_event_attendees a
      on a.user_id = t.member_id and a.event_id = ${eventId}
    where pt.playlist_id = ${playlistId} and pt.day is not null
      and a.group_id = ${groupId}
    group by pt.day
  `;
  return Object.fromEntries(rows.map((r) => [r.day, Number(r.n)]));
}

// The admin-starred tracks of a round, for the event page's Highlights block.
export async function highlightTracks(playlistId: number): Promise<ClubTrack[]> {
  const rows = await sql<TrackRow[]>`
    ${TRACK_SELECT_IN_ROUND}
    join song_club_playlist_tracks pt on pt.track_id = t.id
    where pt.playlist_id = ${playlistId} and pt.is_highlight = true
    order by pt.position asc, t.id asc
  `;
  return rows.map(mapTrack);
}

// Admin-only (routes enforce it): star/unstar a track within a round.
export async function setTrackHighlight(
  playlistId: number,
  trackId: number,
  isHighlight: boolean
): Promise<boolean> {
  const result = await sql`
    update song_club_playlist_tracks set is_highlight = ${isHighlight}
    where playlist_id = ${playlistId} and track_id = ${trackId}
  `;
  return result.count > 0;
}

// Tracks that aren't in any playlist — the "Singles" shelf on the portal.
export async function standaloneTracks(): Promise<ClubTrack[]> {
  const rows = await sql<TrackRow[]>`
    ${TRACK_SELECT}
    where not exists (
      select 1 from song_club_playlist_tracks pt where pt.track_id = t.id
    )
    order by t.created_at desc, t.id desc
  `;
  return rows.map(mapTrack);
}

// For the gated audio route: just the storage pointers, no joins.
export async function getTrackAudioRef(
  id: number
): Promise<{ r2Key: string | null; url: string | null } | null> {
  const [row] = await sql<Array<{ r2_key: string | null; url: string | null }>>`
    select r2_key, url from song_club_tracks where id = ${id}
  `;
  return row ? { r2Key: row.r2_key, url: row.url } : null;
}

export async function getTrack(id: number): Promise<ClubTrack | null> {
  const rows = await sql<TrackRow[]>`${TRACK_SELECT} where t.id = ${id}`;
  return rows[0] ? mapTrack(rows[0]) : null;
}

export async function createTrack(input: {
  actor: ClubActor;
  title: string;
  notes?: string | null;
  // Private-bucket uploads set r2Key and no url; url remains for anything
  // legacy-shaped. At least one must be present.
  url?: string | null;
  r2Key?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  playlistId?: number | null;
  // Which song-a-day day this upload files under (YYYY-MM-DD; routes validate
  // against the event's range). Only meaningful with a playlistId.
  day?: string | null;
  peaks?: number[] | null;
  durationSeconds?: number | null;
}): Promise<ClubTrack | null> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return null;
  const notes = input.notes?.trim().slice(0, 2000) || null;
  const fromAdmin = 'admin' in input.actor;
  // Clamp the peak array so a bad client can't store something huge.
  const peaks =
    Array.isArray(input.peaks) && input.peaks.length > 0 && input.peaks.length <= 4000
      ? (sql.json(input.peaks.map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)) as unknown as Parameters<typeof sql.json>[0]))
      : null;

  if (!input.url && !input.r2Key) return null;

  const [row] = await sql<Array<{ id: number }>>`
    insert into song_club_tracks
      (member_id, from_admin, title, notes, url, r2_key, content_type, size_bytes, peaks, duration_seconds)
    values (${fromAdmin ? null : (input.actor as { memberId: number }).memberId}, ${fromAdmin},
            ${title}, ${notes}, ${input.url ?? null}, ${input.r2Key ?? null},
            ${input.contentType ?? null}, ${input.sizeBytes ?? null}, ${peaks},
            ${typeof input.durationSeconds === 'number' && input.durationSeconds > 0 ? input.durationSeconds : null})
    returning id
  `;
  const trackId = Number(row.id);

  if (input.playlistId) {
    // Appends to the round; a bogus playlistId just leaves the track standalone.
    await sql`
      insert into song_club_playlist_tracks (playlist_id, track_id, position, day)
      select ${input.playlistId}, ${trackId},
             coalesce(max(position), 0) + 1, ${input.day ?? null}
      from song_club_playlist_tracks where playlist_id = ${input.playlistId}
      on conflict do nothing
    `.catch(() => {});
  }

  return getTrack(trackId);
}

// Members may delete their own tracks; the admin may delete any. Comments and
// playlist rows cascade. (The R2 object stays — storage is cheap and the URL
// is unguessable; a cleanup pass can come later if it ever matters.)
export async function deleteTrack(id: number, by: ClubActor): Promise<boolean> {
  const result =
    'admin' in by
      ? await sql`delete from song_club_tracks where id = ${id}`
      : await sql`delete from song_club_tracks where id = ${id} and member_id = ${by.memberId}`;
  return result.count > 0;
}

// --- playlist membership (admin-only; routes enforce it) ---

export async function removeTrackFromPlaylist(
  playlistId: number,
  trackId: number
): Promise<boolean> {
  const result = await sql`
    delete from song_club_playlist_tracks
    where playlist_id = ${playlistId} and track_id = ${trackId}
  `;
  return result.count > 0;
}

// Reorder by full track-id list; ids not in the playlist are ignored, missing
// ones keep their old (now-gapped) positions — harmless, order-by still works.
export async function reorderPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  await sql.begin(async (tx) => {
    for (let i = 0; i < trackIds.length; i++) {
      await tx`
        update song_club_playlist_tracks set position = ${i + 1}
        where playlist_id = ${playlistId} and track_id = ${trackIds[i]}
      `;
    }
  });
}

// --- comments ---

export async function trackComments(trackId: number): Promise<ClubTrackComment[]> {
  const rows = await sql<
    Array<{
      id: number;
      track_id: number;
      member_id: number | null;
      from_admin: boolean;
      member_name: string | null;
      avatar_url: string | null;
      body: string;
      timestamp_seconds: number | null;
      created_at: string;
    }>
  >`
    select c.id, c.track_id, c.member_id, c.from_admin, m.name as member_name,
           m.avatar_url, c.body, c.timestamp_seconds, c.created_at::text as created_at
    from song_club_track_comments c
    left join users m on m.id = c.member_id
    where c.track_id = ${trackId}
    order by c.created_at asc, c.id asc
  `;
  const reactions = await reactionsForComments(rows.map((r) => Number(r.id)));
  return rows.map((r) => ({
    id: Number(r.id),
    trackId: Number(r.track_id),
    memberId: r.member_id === null ? null : Number(r.member_id),
    fromAdmin: r.from_admin,
    authorName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
    avatarUrl: r.avatar_url,
    body: r.body,
    timestampSeconds: r.timestamp_seconds === null ? null : Number(r.timestamp_seconds),
    createdAt: r.created_at,
    reactions: reactions.get(Number(r.id)) ?? [],
  }));
}

// All comments for a playlist's tracks in one go, keyed by track id — the
// playlist page renders every thread inline.
export async function playlistComments(
  playlistId: number
): Promise<Record<number, ClubTrackComment[]>> {
  const rows = await sql<
    Array<{
      id: number;
      track_id: number;
      member_id: number | null;
      from_admin: boolean;
      member_name: string | null;
      avatar_url: string | null;
      body: string;
      timestamp_seconds: number | null;
      created_at: string;
    }>
  >`
    select c.id, c.track_id, c.member_id, c.from_admin, m.name as member_name,
           m.avatar_url, c.body, c.timestamp_seconds, c.created_at::text as created_at
    from song_club_track_comments c
    join song_club_playlist_tracks pt on pt.track_id = c.track_id
    left join users m on m.id = c.member_id
    where pt.playlist_id = ${playlistId}
    order by c.created_at asc, c.id asc
  `;
  const reactions = await reactionsForComments(rows.map((r) => Number(r.id)));
  const byTrack: Record<number, ClubTrackComment[]> = {};
  for (const r of rows) {
    const comment: ClubTrackComment = {
      id: Number(r.id),
      trackId: Number(r.track_id),
      memberId: r.member_id === null ? null : Number(r.member_id),
      fromAdmin: r.from_admin,
      authorName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
      avatarUrl: r.avatar_url,
      body: r.body,
      timestampSeconds: r.timestamp_seconds === null ? null : Number(r.timestamp_seconds),
      createdAt: r.created_at,
      reactions: reactions.get(Number(r.id)) ?? [],
    };
    (byTrack[comment.trackId] ??= []).push(comment);
  }
  return byTrack;
}

// Slack-style toggle on a track comment: add the emoji if this person hasn't
// used it there, remove it if they have. Returns the comment's track id (for
// the thread refresh), or null if the comment is gone / the emoji isn't ours.
export async function toggleCommentReaction(
  commentId: number,
  by: ClubActor,
  emoji: string
): Promise<number | null> {
  if (!isClubReactionEmoji(emoji)) return null;
  const [comment] = await sql<Array<{ track_id: number }>>`
    select track_id from song_club_track_comments where id = ${commentId}
  `;
  if (!comment) return null;
  const removed =
    'admin' in by
      ? await sql`
          delete from song_club_comment_reactions
          where comment_id = ${commentId} and member_id is null and emoji = ${emoji}`
      : await sql`
          delete from song_club_comment_reactions
          where comment_id = ${commentId} and member_id = ${by.memberId} and emoji = ${emoji}`;
  if (removed.count === 0) {
    await sql`
      insert into song_club_comment_reactions (comment_id, member_id, from_admin, emoji)
      values (${commentId}, ${'admin' in by ? null : by.memberId}, ${'admin' in by}, ${emoji})
      on conflict do nothing
    `;
  }
  return Number(comment.track_id);
}

export async function createComment(input: {
  trackId: number;
  actor: ClubActor;
  body: string;
  timestampSeconds?: number | null;
}): Promise<boolean> {
  const body = input.body.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!body) return false;
  const [track] = await sql<Array<{ id: number }>>`
    select id from song_club_tracks where id = ${input.trackId}
  `;
  if (!track) return false;
  const fromAdmin = 'admin' in input.actor;
  const timestamp =
    typeof input.timestampSeconds === 'number' && input.timestampSeconds >= 0
      ? Math.floor(input.timestampSeconds)
      : null;
  await sql`
    insert into song_club_track_comments (track_id, member_id, from_admin, body, timestamp_seconds)
    values (${input.trackId}, ${fromAdmin ? null : (input.actor as { memberId: number }).memberId},
            ${fromAdmin}, ${body}, ${timestamp})
  `;
  return true;
}

// The uploader to notify about a new comment on their track: their email,
// name, and whether they want these emails. null when the track has no member
// uploader (an admin upload), the account is inactive, or it's gone.
export async function getTrackCommentNotifyTarget(
  trackId: number
): Promise<{ memberId: number; email: string; name: string; title: string; notify: boolean } | null> {
  const [row] = await sql<
    Array<{ member_id: number; email: string; name: string; title: string; notify: boolean }>
  >`
    select t.member_id, u.email, u.name, t.title, u.notify_track_comments as notify
    from song_club_tracks t
    join users u on u.id = t.member_id
    where t.id = ${trackId} and u.status = 'active'
  `;
  if (!row) return null;
  return {
    memberId: Number(row.member_id),
    email: row.email,
    name: row.name,
    title: row.title,
    notify: row.notify,
  };
}

export async function deleteComment(id: number, by: ClubActor): Promise<number | null> {
  const rows =
    'admin' in by
      ? await sql<Array<{ track_id: number }>>`
          delete from song_club_track_comments where id = ${id} returning track_id
        `
      : await sql<Array<{ track_id: number }>>`
          delete from song_club_track_comments
          where id = ${id} and member_id = ${by.memberId}
          returning track_id
        `;
  return rows[0] ? Number(rows[0].track_id) : null;
}
