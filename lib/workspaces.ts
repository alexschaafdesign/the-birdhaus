// Songwriting workspaces — the tenancy layer over the song pile (migration
// 091). Each workspace is one songwriter's world: access is a
// workspace_members row (or Birdhaus staff/admin, who see everything).
// Named generically because a future product could scope Song Club under the
// same concept. Every API mutation resolves its entity back to a workspace
// and authorizes THERE — never against a global role.

import { notFound, redirect } from 'next/navigation';
import { sql } from './db';
import { getClubMember, type BandActor, type ClubMember } from './club-members';
import { isAdminSession } from './admin-session';

export interface Workspace {
  id: number;
  slug: string;
  name: string;
}

export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const [row] = await sql<Array<{ id: number; slug: string; name: string }>>`
    select id, slug, name from workspaces where slug = ${slug}
  `;
  return row ? { id: Number(row.id), slug: row.slug, name: row.name } : null;
}

// Every workspace this user belongs to — for the login landing redirect.
export async function listWorkspacesForUser(userId: number): Promise<Workspace[]> {
  const rows = await sql<Array<{ id: number; slug: string; name: string }>>`
    select w.id, w.slug, w.name
    from workspace_members m join workspaces w on w.id = m.workspace_id
    where m.user_id = ${userId}
    order by m.created_at asc
  `;
  return rows.map((r) => ({ id: Number(r.id), slug: r.slug, name: r.name }));
}

// The gate every /w/[slug] page runs first. Unknown slug → 404; logged-in
// user without membership → 404 (the workspace's existence is not theirs to
// know); no session at all → the neutral login, returning here after.
export async function requireWorkspacePage(
  slug: string,
  nextPath: string
): Promise<{ workspace: Workspace; actor: BandActor; member: ClubMember | null }> {
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();
  const member = await getClubMember();
  const actor = await actorForWorkspace(workspace.id);
  if (!actor) {
    if (member) notFound();
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return { workspace, actor, member };
}

// Who's acting on this workspace: a member of it (owner flag from their
// membership row), staff/admin (global oversight), or nobody.
export async function actorForWorkspace(workspaceId: number): Promise<BandActor | null> {
  const member = await getClubMember();
  if (member) {
    const staff = member.roles.includes('staff');
    const [m] = await sql<Array<{ role: string }>>`
      select role from workspace_members
      where workspace_id = ${workspaceId} and user_id = ${member.id}
    `;
    if (!staff && !m) return null;
    return { memberId: member.id, staff, owner: m?.role === 'owner' };
  }
  return (await isAdminSession()) ? { admin: true } : null;
}

// Entity-scoped variants: resolve the entity's workspace, then authorize
// there. Null means "no such entity or no access" — routes treat both as 404
// territory so ids don't leak across workspaces.

export async function actorForSong(
  songId: number
): Promise<{ actor: BandActor; workspaceId: number } | null> {
  const [row] = await sql<Array<{ workspace_id: number }>>`
    select workspace_id from band_songs where id = ${songId}
  `;
  if (!row) return null;
  const workspaceId = Number(row.workspace_id);
  const actor = await actorForWorkspace(workspaceId);
  return actor ? { actor, workspaceId } : null;
}

export async function actorForGroup(
  groupId: number
): Promise<{ actor: BandActor; workspaceId: number } | null> {
  const [row] = await sql<Array<{ workspace_id: number }>>`
    select workspace_id from band_song_groups where id = ${groupId}
  `;
  if (!row) return null;
  const workspaceId = Number(row.workspace_id);
  const actor = await actorForWorkspace(workspaceId);
  return actor ? { actor, workspaceId } : null;
}

export async function actorForVersion(
  versionId: number
): Promise<{ actor: BandActor; workspaceId: number } | null> {
  const [row] = await sql<Array<{ workspace_id: number }>>`
    select s.workspace_id from band_song_versions v
    join band_songs s on s.id = v.song_id
    where v.id = ${versionId}
  `;
  if (!row) return null;
  const workspaceId = Number(row.workspace_id);
  const actor = await actorForWorkspace(workspaceId);
  return actor ? { actor, workspaceId } : null;
}

export async function actorForComment(
  commentId: number
): Promise<{ actor: BandActor; workspaceId: number } | null> {
  const [row] = await sql<Array<{ workspace_id: number }>>`
    select s.workspace_id from band_song_comments c
    join band_songs s on s.id = c.song_id
    where c.id = ${commentId}
  `;
  if (!row) return null;
  const workspaceId = Number(row.workspace_id);
  const actor = await actorForWorkspace(workspaceId);
  return actor ? { actor, workspaceId } : null;
}

export async function actorForLyricsRevision(
  revisionId: number
): Promise<{ actor: BandActor; workspaceId: number } | null> {
  const [row] = await sql<Array<{ workspace_id: number }>>`
    select s.workspace_id from band_song_lyrics_revisions r
    join band_songs s on s.id = r.song_id
    where r.id = ${revisionId}
  `;
  if (!row) return null;
  const workspaceId = Number(row.workspace_id);
  const actor = await actorForWorkspace(workspaceId);
  return actor ? { actor, workspaceId } : null;
}

// For the presign route, which hands out R2 upload URLs before any song
// exists: any workspace member at all (or staff/admin). The register step
// re-authorizes against the target song's workspace.
export async function actorForAnyWorkspace(): Promise<BandActor | null> {
  const member = await getClubMember();
  if (member) {
    const staff = member.roles.includes('staff');
    if (staff) return { memberId: member.id, staff };
    const [m] = await sql<Array<{ role: string }>>`
      select role from workspace_members where user_id = ${member.id} limit 1
    `;
    return m ? { memberId: member.id, staff: false } : null;
  }
  return (await isAdminSession()) ? { admin: true } : null;
}
