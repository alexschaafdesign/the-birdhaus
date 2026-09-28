// Yellow Ostrich lyrics — append-only revisions of one living document per
// song (see migration 090). Current lyrics = latest revision; history is the
// table itself. Collaborative like song metadata: any band actor edits.
// Callers authenticate first; this module is data only.

import { sql } from './db';
import type { BandActor } from './club-members';

export interface LyricsRevision {
  id: number;
  songId: number;
  body: string;
  editorName: string;
  createdAt: string;
  // Labels of audio versions whose lyrics snapshot pins this revision.
  versionLabels: string[];
}

const MAX_LYRICS_LENGTH = 20000;

interface RevisionRow {
  id: number;
  song_id: number;
  body: string;
  from_admin: boolean;
  editor_name: string | null;
  created_at: string;
  version_labels: string[] | null;
}

function mapRevision(r: RevisionRow): LyricsRevision {
  return {
    id: Number(r.id),
    songId: Number(r.song_id),
    body: r.body,
    editorName: r.from_admin ? 'the Birdhaus' : r.editor_name ?? 'Former member',
    createdAt: r.created_at,
    versionLabels: Array.isArray(r.version_labels) ? r.version_labels : [],
  };
}

// Newest first — [0] is the current lyrics.
export async function listLyricsRevisions(songId: number): Promise<LyricsRevision[]> {
  const rows = await sql<RevisionRow[]>`
    select r.id, r.song_id, r.body, r.from_admin, u.name as editor_name,
           r.created_at::text as created_at,
           (select array_agg(v.label order by v.created_at asc)
              from band_song_versions v where v.lyrics_revision_id = r.id)
             as version_labels
    from band_song_lyrics_revisions r
    left join users u on u.id = r.edited_by
    where r.song_id = ${songId}
    order by r.id desc
  `;
  return rows.map(mapRevision);
}

// A save that changes nothing is a no-op (returns the current revision), so
// opening the editor and hitting save doesn't spam history.
export async function saveLyrics(input: {
  actor: BandActor;
  songId: number;
  body: string;
}): Promise<LyricsRevision | null> {
  const body = input.body.replace(/\r\n/g, '\n').slice(0, MAX_LYRICS_LENGTH);
  const [song] = await sql<Array<{ id: number }>>`
    select id from band_songs where id = ${input.songId}
  `;
  if (!song) return null;

  const [current] = await sql<Array<{ id: number; body: string }>>`
    select id, body from band_song_lyrics_revisions
    where song_id = ${input.songId} order by id desc limit 1
  `;
  if (current && current.body === body) {
    const all = await listLyricsRevisions(input.songId);
    return all.find((r) => r.id === Number(current.id)) ?? null;
  }
  // First-ever save of an empty body would be a pointless blank revision.
  if (!current && body.trim() === '') return null;

  const editedBy = 'admin' in input.actor ? null : input.actor.memberId;
  const [row] = await sql<Array<{ id: number }>>`
    insert into band_song_lyrics_revisions (song_id, body, edited_by, from_admin)
    values (${input.songId}, ${body}, ${editedBy}, ${editedBy === null})
    returning id
  `;
  // Lyric edits count as activity, same as a new version.
  await sql`update band_songs set updated_at = now() where id = ${input.songId}`;
  const all = await listLyricsRevisions(input.songId);
  return all.find((r) => r.id === Number(row.id)) ?? null;
}

// Delete one revision from the history — the escape hatch for lyrics saved
// to the wrong song. Author-or-moderator, like versions and comments.
// Deleting the latest revision makes the previous one current; versions
// pinned to it lose their snapshot (FK sets the pin null), they don't break.
export async function deleteLyricsRevision(id: number, by: BandActor): Promise<boolean> {
  const moderator = 'admin' in by || by.staff || by.owner === true;
  const result = moderator
    ? await sql`delete from band_song_lyrics_revisions where id = ${id}`
    : await sql`
        delete from band_song_lyrics_revisions
        where id = ${id} and edited_by = ${'admin' in by ? null : by.memberId}
      `;
  return result.count > 0;
}

// Re-point a version's "lyrics as recorded" snapshot (or clear it). The
// revision must belong to the version's own song.
export async function pinVersionLyrics(
  versionId: number,
  revisionId: number | null
): Promise<boolean> {
  const [version] = await sql<Array<{ song_id: number }>>`
    select song_id from band_song_versions where id = ${versionId}
  `;
  if (!version) return false;
  if (revisionId !== null) {
    const [rev] = await sql<Array<{ id: number }>>`
      select id from band_song_lyrics_revisions
      where id = ${revisionId} and song_id = ${version.song_id}
    `;
    if (!rev) return false;
  }
  await sql`
    update band_song_versions set lyrics_revision_id = ${revisionId}
    where id = ${versionId}
  `;
  return true;
}
