// Yellow Ostrich band workspace — 50+ in-progress songs being triaged for the
// album. Each song carries a status + freeform tags and holds multiple audio
// versions (voice memo, demo v2, ...) uploaded direct to R2; comments hang off
// the SONG, optionally pinned to one version. Callers authenticate first
// (getBandActor); this module only does data + ownership checks.

import { sql } from './db';
import type { BandActor } from './club-members';
import { BAND_SONG_STATUSES, type BandSongStatus } from './band-constants';

export interface BandSong {
  id: number;
  title: string;
  status: BandSongStatus;
  tags: string[];
  notes: string | null;
  pinned: boolean;
  createdBy: number | null;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  commentCount: number;
  latestVersionLabel: string | null;
  latestVersionAt: string | null;
}

export interface BandSongVersion {
  id: number;
  songId: number;
  label: string;
  url: string;
  sizeBytes: number | null;
  peaks: number[] | null;
  durationSeconds: number | null;
  uploadedBy: number | null;
  uploaderName: string;
  createdAt: string;
}

export interface BandSongComment {
  id: number;
  songId: number;
  versionId: number | null;
  versionLabel: string | null;
  memberId: number | null;
  fromAdmin: boolean;
  authorName: string;
  avatarUrl: string | null;
  body: string;
  timestampSeconds: number | null;
  createdAt: string;
}

const MAX_NOTES_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 5000;
const MAX_TAGS = 20;

// Deletes and edits of other people's uploads/comments: staff and the admin
// session moderate; everyone else only touches their own.
function canModerate(by: BandActor): boolean {
  return 'admin' in by || by.staff;
}

function actorMemberId(by: BandActor): number | null {
  return 'admin' in by ? null : by.memberId;
}

export function sanitizeStatus(input: unknown): BandSongStatus | null {
  return BAND_SONG_STATUSES.includes(input as BandSongStatus)
    ? (input as BandSongStatus)
    : null;
}

// Tags are the whole taxonomy (categories AND vibes), so keep them tidy:
// trimmed, lowercased, deduped, capped.
export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (out.length >= MAX_TAGS) break;
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

interface SongRow {
  id: number;
  title: string;
  status: BandSongStatus;
  tags: string[];
  notes: string | null;
  pinned: boolean;
  created_by: number | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  comment_count: number;
  latest_version_label: string | null;
  latest_version_at: string | null;
}

const SONG_SELECT = sql`
  select s.id, s.title, s.status, s.tags, s.notes, s.pinned,
         s.created_by, u.name as creator_name,
         s.created_at::text as created_at, s.updated_at::text as updated_at,
         (select count(*)::int from band_song_versions v where v.song_id = s.id)
           as version_count,
         (select count(*)::int from band_song_comments c where c.song_id = s.id)
           as comment_count,
         lv.label as latest_version_label, lv.created_at as latest_version_at
  from band_songs s
  left join users u on u.id = s.created_by
  left join lateral (
    select v.label, v.created_at::text as created_at from band_song_versions v
    where v.song_id = s.id order by v.created_at desc, v.id desc limit 1
  ) lv on true
`;

function mapSong(r: SongRow): BandSong {
  return {
    id: Number(r.id),
    title: r.title,
    status: r.status,
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes,
    pinned: r.pinned,
    createdBy: r.created_by === null ? null : Number(r.created_by),
    creatorName: r.creator_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    versionCount: Number(r.version_count),
    commentCount: Number(r.comment_count),
    latestVersionLabel: r.latest_version_label,
    latestVersionAt: r.latest_version_at,
  };
}

// --- songs ---

export async function listSongs(): Promise<BandSong[]> {
  const rows = await sql<SongRow[]>`
    ${SONG_SELECT} order by s.pinned desc, s.updated_at desc, s.id desc
  `;
  return rows.map(mapSong);
}

export async function getSong(id: number): Promise<BandSong | null> {
  const [r] = await sql<SongRow[]>`${SONG_SELECT} where s.id = ${id}`;
  return r ? mapSong(r) : null;
}

// Every tag in use, for the filter chips and the tag-input autocomplete.
export async function distinctTags(): Promise<string[]> {
  const rows = await sql<Array<{ tag: string }>>`
    select distinct t.tag from band_songs, unnest(tags) as t(tag) order by t.tag asc
  `;
  return rows.map((r) => r.tag);
}

export async function createSong(input: {
  actor: BandActor;
  title: string;
  status?: unknown;
  tags?: unknown;
  notes?: string | null;
}): Promise<BandSong | null> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return null;
  const status = sanitizeStatus(input.status) ?? 'idea';
  const tags = sanitizeTags(input.tags);
  const notes = input.notes?.trim().slice(0, MAX_NOTES_LENGTH) || null;
  const [row] = await sql<Array<{ id: number }>>`
    insert into band_songs (title, status, tags, notes, created_by)
    values (${title}, ${status}, ${tags}, ${notes}, ${actorMemberId(input.actor)})
    returning id
  `;
  return getSong(Number(row.id));
}

// Collaborative by design: any band actor may edit any song's metadata.
export async function updateSong(
  id: number,
  input: {
    title?: string;
    status?: unknown;
    tags?: unknown;
    notes?: string | null;
    pinned?: boolean;
  }
): Promise<BandSong | null> {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) || null : null;
  const status = sanitizeStatus(input.status);
  const hasTags = input.tags !== undefined;
  const tags = sanitizeTags(input.tags);
  const hasNotes = input.notes !== undefined;
  const notes = input.notes?.trim().slice(0, MAX_NOTES_LENGTH) || null;
  const [row] = await sql<Array<{ id: number }>>`
    update band_songs set
      title = coalesce(${title}, title),
      status = coalesce(${status}, status),
      tags = ${hasTags ? tags : sql`tags`},
      notes = ${hasNotes ? notes : sql`notes`},
      pinned = coalesce(${input.pinned ?? null}, pinned),
      updated_at = now()
    where id = ${id}
    returning id
  `;
  return row ? getSong(Number(row.id)) : null;
}

// Whole-song delete (versions and comments cascade) is creator-or-moderator —
// a bigger hammer than the per-version/per-comment deletes below.
export async function deleteSong(id: number, by: BandActor): Promise<boolean> {
  const result = canModerate(by)
    ? await sql`delete from band_songs where id = ${id}`
    : await sql`delete from band_songs where id = ${id} and created_by = ${actorMemberId(by)}`;
  return result.count > 0;
}

// --- versions ---

interface VersionRow {
  id: number;
  song_id: number;
  label: string;
  url: string | null;
  r2_key: string | null;
  size_bytes: number | null;
  peaks: number[] | null;
  duration_seconds: number | null;
  uploaded_by: number | null;
  uploader_name: string | null;
  created_at: string;
}

const VERSION_SELECT = sql`
  select v.id, v.song_id, v.label, v.url, v.r2_key, v.size_bytes, v.peaks,
         v.duration_seconds, v.uploaded_by, u.name as uploader_name,
         v.created_at::text as created_at
  from band_song_versions v
  left join users u on u.id = v.uploaded_by
`;

function mapVersion(r: VersionRow): BandSongVersion {
  return {
    id: Number(r.id),
    songId: Number(r.song_id),
    label: r.label,
    // Migrated versions play through the session-gated route (302 → presigned
    // GET on the private bucket); un-migrated ones use the legacy public URL.
    url: r.r2_key ? `/api/ostrich/audio/${Number(r.id)}` : r.url ?? '',
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    peaks: Array.isArray(r.peaks) ? r.peaks : null,
    durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    uploadedBy: r.uploaded_by === null ? null : Number(r.uploaded_by),
    uploaderName: r.uploader_name ?? (r.uploaded_by === null ? 'the Birdhaus' : 'Former member'),
    createdAt: r.created_at,
  };
}

// For the gated audio route: just the storage pointers, no joins.
export async function getVersionAudioRef(
  id: number
): Promise<{ r2Key: string | null; url: string | null } | null> {
  const [row] = await sql<Array<{ r2_key: string | null; url: string | null }>>`
    select r2_key, url from band_song_versions where id = ${id}
  `;
  return row ? { r2Key: row.r2_key, url: row.url } : null;
}

export async function songVersions(songId: number): Promise<BandSongVersion[]> {
  const rows = await sql<VersionRow[]>`
    ${VERSION_SELECT} where v.song_id = ${songId}
    order by v.created_at desc, v.id desc
  `;
  return rows.map(mapVersion);
}

export async function createVersion(input: {
  actor: BandActor;
  songId: number;
  label: string;
  url: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  peaks?: number[] | null;
  durationSeconds?: number | null;
}): Promise<BandSongVersion | null> {
  const label = input.label.trim().slice(0, 120);
  if (!label) return null;
  const [song] = await sql<Array<{ id: number }>>`
    select id from band_songs where id = ${input.songId}
  `;
  if (!song) return null;
  // Clamp the peak array so a bad client can't store something huge.
  const peaks =
    Array.isArray(input.peaks) && input.peaks.length > 0 && input.peaks.length <= 4000
      ? (sql.json(input.peaks.map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)) as unknown as Parameters<typeof sql.json>[0]))
      : null;

  const [row] = await sql<Array<{ id: number }>>`
    insert into band_song_versions
      (song_id, label, url, content_type, size_bytes, peaks, duration_seconds, uploaded_by)
    values (${input.songId}, ${label}, ${input.url},
            ${input.contentType ?? null}, ${input.sizeBytes ?? null}, ${peaks},
            ${typeof input.durationSeconds === 'number' && input.durationSeconds > 0 ? input.durationSeconds : null},
            ${actorMemberId(input.actor)})
    returning id
  `;
  // A new version counts as activity — float the song in "recently active".
  await sql`update band_songs set updated_at = now() where id = ${input.songId}`;
  const [v] = await sql<VersionRow[]>`${VERSION_SELECT} where v.id = ${row.id}`;
  return v ? mapVersion(v) : null;
}

export async function updateVersionLabel(
  id: number,
  label: string,
  by: BandActor
): Promise<boolean> {
  const clean = label.trim().slice(0, 120);
  if (!clean) return false;
  const result = canModerate(by)
    ? await sql`update band_song_versions set label = ${clean} where id = ${id}`
    : await sql`
        update band_song_versions set label = ${clean}
        where id = ${id} and uploaded_by = ${actorMemberId(by)}
      `;
  return result.count > 0;
}

// Owner-or-moderator. Comments pinned to the version survive (version_id goes
// null). The R2 object stays — storage is cheap and the URL is unguessable.
export async function deleteVersion(id: number, by: BandActor): Promise<number | null> {
  const rows = canModerate(by)
    ? await sql<Array<{ song_id: number }>>`
        delete from band_song_versions where id = ${id} returning song_id
      `
    : await sql<Array<{ song_id: number }>>`
        delete from band_song_versions
        where id = ${id} and uploaded_by = ${actorMemberId(by)}
        returning song_id
      `;
  return rows[0] ? Number(rows[0].song_id) : null;
}

// --- comments ---

interface CommentRow {
  id: number;
  song_id: number;
  version_id: number | null;
  version_label: string | null;
  member_id: number | null;
  from_admin: boolean;
  member_name: string | null;
  avatar_url: string | null;
  body: string;
  timestamp_seconds: number | null;
  created_at: string;
}

const COMMENT_SELECT = sql`
  select c.id, c.song_id, c.version_id, v.label as version_label,
         c.member_id, c.from_admin, m.name as member_name, m.avatar_url,
         c.body, c.timestamp_seconds, c.created_at::text as created_at
  from band_song_comments c
  left join users m on m.id = c.member_id
  left join band_song_versions v on v.id = c.version_id
`;

function mapComment(r: CommentRow): BandSongComment {
  return {
    id: Number(r.id),
    songId: Number(r.song_id),
    versionId: r.version_id === null ? null : Number(r.version_id),
    versionLabel: r.version_label,
    memberId: r.member_id === null ? null : Number(r.member_id),
    fromAdmin: r.from_admin,
    authorName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
    avatarUrl: r.avatar_url,
    body: r.body,
    timestampSeconds: r.timestamp_seconds === null ? null : Number(r.timestamp_seconds),
    createdAt: r.created_at,
  };
}

export async function songComments(songId: number): Promise<BandSongComment[]> {
  const rows = await sql<CommentRow[]>`
    ${COMMENT_SELECT} where c.song_id = ${songId}
    order by c.created_at asc, c.id asc
  `;
  return rows.map(mapComment);
}

export async function createComment(input: {
  songId: number;
  actor: BandActor;
  body: string;
  versionId?: number | null;
  timestampSeconds?: number | null;
}): Promise<boolean> {
  const body = input.body.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!body) return false;
  const [song] = await sql<Array<{ id: number }>>`
    select id from band_songs where id = ${input.songId}
  `;
  if (!song) return false;
  // A version reference must belong to this song; a bogus one is dropped
  // rather than failing the comment.
  let versionId: number | null = null;
  if (typeof input.versionId === 'number') {
    const [v] = await sql<Array<{ id: number }>>`
      select id from band_song_versions
      where id = ${input.versionId} and song_id = ${input.songId}
    `;
    versionId = v ? Number(v.id) : null;
  }
  const fromAdmin = 'admin' in input.actor;
  const timestamp =
    typeof input.timestampSeconds === 'number' && input.timestampSeconds >= 0
      ? Math.floor(input.timestampSeconds)
      : null;
  await sql`
    insert into band_song_comments
      (song_id, version_id, member_id, from_admin, body, timestamp_seconds)
    values (${input.songId}, ${versionId}, ${actorMemberId(input.actor)},
            ${fromAdmin}, ${body}, ${timestamp})
  `;
  return true;
}

export async function deleteComment(id: number, by: BandActor): Promise<number | null> {
  const rows = canModerate(by)
    ? await sql<Array<{ song_id: number }>>`
        delete from band_song_comments where id = ${id} returning song_id
      `
    : await sql<Array<{ song_id: number }>>`
        delete from band_song_comments
        where id = ${id} and member_id = ${actorMemberId(by)}
        returning song_id
      `;
  return rows[0] ? Number(rows[0].song_id) : null;
}
