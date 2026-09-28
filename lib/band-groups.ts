// Yellow Ostrich groups — curated, ordered shelves over the song pile
// ("Current Favorites", "Quiet Ones"). Multi-membership is the point: one
// song can sit in any number of groups. band_songs stays the master list;
// nothing here ever mutates a song. Collaborative like song metadata: any
// band actor may manage any group (callers authenticate via getBandActor
// first; this module is data only).

import { sql } from './db';
import type { BandActor } from './club-members';

export interface BandSongGroup {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
  // Song ids in group order — the pile already ships whole to the client,
  // so memberships do too and the chips/sections render without round trips.
  songIds: number[];
}

const MAX_NAME_LENGTH = 80;

function actorMemberId(by: BandActor): number | null {
  return 'admin' in by ? null : by.memberId;
}

export async function listGroups(workspaceId: number): Promise<BandSongGroup[]> {
  const rows = await sql<
    Array<{
      id: number;
      name: string;
      sort_order: number;
      created_at: string;
      song_ids: number[] | null;
    }>
  >`
    select g.id, g.name, g.sort_order, g.created_at::text as created_at,
           (select array_agg(m.song_id order by m.position asc, m.added_at asc)
              from band_song_group_members m where m.group_id = g.id) as song_ids
    from band_song_groups g
    where g.workspace_id = ${workspaceId}
    order by g.sort_order asc, g.id asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    sortOrder: Number(r.sort_order),
    createdAt: r.created_at,
    songIds: Array.isArray(r.song_ids) ? r.song_ids.map(Number) : [],
  }));
}

export async function createGroup(input: {
  actor: BandActor;
  workspaceId: number;
  name: string;
}): Promise<BandSongGroup | null> {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  const [row] = await sql<Array<{ id: number }>>`
    insert into band_song_groups (workspace_id, name, sort_order, created_by)
    values (
      ${input.workspaceId}, ${name},
      (select coalesce(max(sort_order), 0) + 1 from band_song_groups
       where workspace_id = ${input.workspaceId}),
      ${actorMemberId(input.actor)}
    )
    returning id
  `;
  const groups = await listGroups(input.workspaceId);
  return groups.find((g) => g.id === Number(row.id)) ?? null;
}

export async function renameGroup(id: number, name: string): Promise<boolean> {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!clean) return false;
  const result = await sql`
    update band_song_groups set name = ${clean}, updated_at = now() where id = ${id}
  `;
  return result.count > 0;
}

// Membership cascades; songs are untouched by design.
export async function deleteGroup(id: number): Promise<boolean> {
  const result = await sql`delete from band_song_groups where id = ${id}`;
  return result.count > 0;
}

// Appends at the end. A song already in the group no-ops rather than erroring
// — two people adding the same song from the popover isn't a conflict. The
// song and group must live in the same workspace.
export async function addSongToGroup(groupId: number, songId: number): Promise<boolean> {
  const [song] = await sql<Array<{ id: number; workspace_id: number }>>`
    select id, workspace_id from band_songs where id = ${songId}
  `;
  const [group] = await sql<Array<{ id: number; workspace_id: number }>>`
    select id, workspace_id from band_song_groups where id = ${groupId}
  `;
  if (!song || !group || Number(song.workspace_id) !== Number(group.workspace_id)) return false;
  await sql`
    insert into band_song_group_members (group_id, song_id, position)
    values (
      ${groupId}, ${songId},
      (select coalesce(max(position), 0) + 1
         from band_song_group_members where group_id = ${groupId})
    )
    on conflict (group_id, song_id) do nothing
  `;
  await sql`update band_song_groups set updated_at = now() where id = ${groupId}`;
  return true;
}

export async function removeSongFromGroup(groupId: number, songId: number): Promise<boolean> {
  const result = await sql`
    delete from band_song_group_members
    where group_id = ${groupId} and song_id = ${songId}
  `;
  if (result.count > 0) {
    await sql`update band_song_groups set updated_at = now() where id = ${groupId}`;
  }
  return result.count > 0;
}

// Reorder from a drag: the client sends the group's full ordered id list and
// positions are rewritten 1..n. Ids not in the group are ignored; members the
// client didn't mention (someone else added a song mid-drag) are shifted
// after the reordered block in their old relative order rather than dropped.
export async function setGroupOrder(groupId: number, songIds: number[]): Promise<boolean> {
  const [group] = await sql<Array<{ id: number }>>`
    select id from band_song_groups where id = ${groupId}
  `;
  if (!group) return false;
  const ids = songIds.filter((n) => Number.isInteger(n)).slice(0, 1000);
  await sql.begin(async (tx) => {
    await tx`
      update band_song_group_members set position = position + ${ids.length}
      where group_id = ${groupId} and not (song_id = any(${ids}))
    `;
    for (let i = 0; i < ids.length; i++) {
      await tx`
        update band_song_group_members set position = ${i + 1}
        where group_id = ${groupId} and song_id = ${ids[i]}
      `;
    }
    await tx`
      update band_song_groups set updated_at = now() where id = ${groupId}
    `;
  });
  return true;
}
