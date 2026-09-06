// Song Club music — the native replacement for Samply. Members upload tracks
// (audio in R2, uploaded direct via presigned URLs), the admin curates
// playlists ("rounds"), and comments hang off the TRACK so feedback follows a
// song wherever it appears. Callers authenticate first (getClubActor); this
// module only does data + ownership checks.

import { sql } from './db';
import type { ClubActor } from './club-members';

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
}

const MAX_COMMENT_LENGTH = 5000;

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
}

const TRACK_SELECT = sql`
  select t.id, t.member_id, t.from_admin, m.name as member_name, t.title,
         t.notes, t.url, t.r2_key, t.peaks, t.duration_seconds, t.created_at::text as created_at,
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

// The event (if any) that links to this round — its flyer is the round's cover.
export async function getRoundEvent(
  playlistId: number
): Promise<{ id: number; slug: string; title: string; flyerUrl: string | null } | null> {
  const [r] = await sql<Array<{ id: number; slug: string; title: string; flyer_url: string | null }>>`
    select id, slug, title, flyer_url from song_club_events
    where playlist_id = ${playlistId}
    order by id asc limit 1
  `;
  return r ? { id: Number(r.id), slug: r.slug, title: r.title, flyerUrl: r.flyer_url } : null;
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
    ${TRACK_SELECT}
    join song_club_playlist_tracks pt on pt.track_id = t.id
    where pt.playlist_id = ${playlistId}
    order by pt.position asc, t.id asc
  `;
  return rows.map(mapTrack);
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
  url: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  playlistId?: number | null;
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

  const [row] = await sql<Array<{ id: number }>>`
    insert into song_club_tracks
      (member_id, from_admin, title, notes, url, content_type, size_bytes, peaks, duration_seconds)
    values (${fromAdmin ? null : (input.actor as { memberId: number }).memberId}, ${fromAdmin},
            ${title}, ${notes}, ${input.url},
            ${input.contentType ?? null}, ${input.sizeBytes ?? null}, ${peaks},
            ${typeof input.durationSeconds === 'number' && input.durationSeconds > 0 ? input.durationSeconds : null})
    returning id
  `;
  const trackId = Number(row.id);

  if (input.playlistId) {
    // Appends to the round; a bogus playlistId just leaves the track standalone.
    await sql`
      insert into song_club_playlist_tracks (playlist_id, track_id, position)
      select ${input.playlistId}, ${trackId},
             coalesce(max(position), 0) + 1
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
    };
    (byTrack[comment.trackId] ??= []).push(comment);
  }
  return byTrack;
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
