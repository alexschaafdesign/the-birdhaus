// Song Club portal board — the shared message thread and the pinned
// files/embeds/links above it. Everything here is members-only; the callers
// (app/club pages + /api/club routes) have already authenticated a member
// session or the admin session before touching this module.

import { sql } from './db';
import { isValidHttpUrl } from './club-embed';
import { isClubReactionEmoji, type ClubReaction } from './club-reactions';

export interface ClubPost {
  id: number;
  memberId: number | null;
  fromAdmin: boolean;
  authorName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  // Facebook-style: one level of replies, nested under their parent post.
  // Replies always have replies: [] themselves.
  replies: ClubPost[];
  reactions: ClubReaction[];
}

export type ClubPinKind = 'file' | 'embed' | 'link';

export interface ClubPin {
  id: number;
  memberId: number | null;
  fromAdmin: boolean;
  authorName: string;
  avatarUrl: string | null;
  kind: ClubPinKind;
  title: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  featured: boolean;
  createdAt: string;
}

const MAX_POST_LENGTH = 5000;

// Oldest-first, so the thread reads top-down with the composer at the bottom.
// Replies come back nested under their parent (also oldest-first), with each
// post's reactions attached. Scopes (mirrors migration 061/083): eventId null
// = the general Song Club board; eventId set + groupId null = that event's
// announcement board; groupId set = that group's board.
export async function getPosts(
  eventId: number | null = null,
  groupId: number | null = null
): Promise<ClubPost[]> {
  const scope =
    eventId === null
      ? sql`p.event_id is null and p.group_id is null`
      : groupId === null
        ? sql`p.event_id = ${eventId} and p.group_id is null`
        : sql`p.event_id = ${eventId} and p.group_id = ${groupId}`;
  const rows = await sql<
    Array<{
      id: number;
      member_id: number | null;
      from_admin: boolean;
      member_name: string | null;
      avatar_url: string | null;
      body: string;
      parent_post_id: number | null;
      created_at: string;
    }>
  >`
    select p.id, p.member_id, p.from_admin, m.name as member_name, m.avatar_url, p.body,
           p.parent_post_id, p.created_at::text as created_at
    from song_club_posts p
    left join users m on m.id = p.member_id
    where ${scope}
    order by p.created_at asc, p.id asc
  `;
  const reactionRows = await sql<
    Array<{
      post_id: number;
      emoji: string;
      member_id: number | null;
      member_name: string | null;
    }>
  >`
    select r.post_id, r.emoji, r.member_id, m.name as member_name
    from song_club_post_reactions r
    left join users m on m.id = r.member_id
    where r.post_id in (select p.id from song_club_posts p where ${scope})
    order by r.created_at asc, r.id asc
  `;

  const reactionsByPost = new Map<number, ClubReaction[]>();
  for (const r of reactionRows) {
    const postId = Number(r.post_id);
    const list = reactionsByPost.get(postId) ?? [];
    if (!reactionsByPost.has(postId)) reactionsByPost.set(postId, list);
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

  const toPost = (r: (typeof rows)[number]): ClubPost => ({
    id: Number(r.id),
    memberId: r.member_id === null ? null : Number(r.member_id),
    fromAdmin: r.from_admin,
    authorName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
    avatarUrl: r.from_admin ? null : r.avatar_url,
    body: r.body,
    createdAt: r.created_at,
    replies: [],
    reactions: reactionsByPost.get(Number(r.id)) ?? [],
  });

  // Nest one level: rows arrive oldest-first, so parents always precede their
  // replies and both levels stay in chronological order.
  const byId = new Map<number, ClubPost>();
  const topLevel: ClubPost[] = [];
  for (const r of rows) {
    const post = toPost(r);
    if (r.parent_post_id === null) {
      byId.set(post.id, post);
      topLevel.push(post);
    } else {
      byId.get(Number(r.parent_post_id))?.replies.push(post);
    }
  }
  return topLevel;
}

// Board scope (+ reply depth) of one post — for permission checks and thread
// refreshes before/after acting on it. Null if the post is gone.
export async function getPostScope(
  id: number
): Promise<{ eventId: number | null; groupId: number | null; parentPostId: number | null } | null> {
  const [row] = await sql<
    Array<{ event_id: number | null; group_id: number | null; parent_post_id: number | null }>
  >`
    select event_id, group_id, parent_post_id from song_club_posts where id = ${id}
  `;
  if (!row) return null;
  return {
    eventId: row.event_id === null ? null : Number(row.event_id),
    groupId: row.group_id === null ? null : Number(row.group_id),
    parentPostId: row.parent_post_id === null ? null : Number(row.parent_post_id),
  };
}

// Slack-style toggle: add the emoji if this person hasn't used it on this
// post, remove it if they have. Returns the post's board scope (for the
// thread refresh), or null if the post is gone / the emoji isn't ours.
export async function togglePostReaction(
  postId: number,
  by: { memberId: number } | { admin: true },
  emoji: string
): Promise<{ eventId: number | null; groupId: number | null } | null> {
  if (!isClubReactionEmoji(emoji)) return null;
  const scope = await getPostScope(postId);
  if (!scope) return null;
  const removed =
    'admin' in by
      ? await sql`
          delete from song_club_post_reactions
          where post_id = ${postId} and member_id is null and emoji = ${emoji}`
      : await sql`
          delete from song_club_post_reactions
          where post_id = ${postId} and member_id = ${by.memberId} and emoji = ${emoji}`;
  if (removed.count === 0) {
    await sql`
      insert into song_club_post_reactions (post_id, member_id, from_admin, emoji)
      values (${postId}, ${'admin' in by ? null : by.memberId}, ${'admin' in by}, ${emoji})
      on conflict do nothing
    `;
  }
  return { eventId: scope.eventId, groupId: scope.groupId };
}

// author: a member id, or 'admin' for a Birdhaus post. eventId scopes the post
// to an event board (null = general); groupId narrows it to a group's board.
// parentId makes it a reply — the reply inherits the PARENT's board scope
// (the caller's eventId/groupId are ignored) and replies stay one level deep:
// replying to a reply is refused.
export async function createPost(
  author: number | 'admin',
  body: string,
  eventId: number | null = null,
  groupId: number | null = null,
  parentId: number | null = null
): Promise<boolean> {
  const trimmed = body.trim().slice(0, MAX_POST_LENGTH);
  if (!trimmed) return false;
  if (parentId !== null) {
    const parent = await getPostScope(parentId);
    if (!parent || parent.parentPostId !== null) return false;
    eventId = parent.eventId;
    groupId = parent.groupId;
  }
  await sql`
    insert into song_club_posts (member_id, from_admin, body, event_id, group_id, parent_post_id)
    values (${author === 'admin' ? null : author}, ${author === 'admin'}, ${trimmed},
            ${eventId}, ${eventId === null ? null : groupId}, ${parentId})
  `;
  return true;
}

// Members may delete their own posts; the admin may delete any. Returns the
// deleted post's board scope (event + group, nulls = general) so the caller
// can return the right refreshed thread, or undefined if nothing was deleted.
export async function deletePost(
  id: number,
  by: { memberId: number } | { admin: true }
): Promise<{ eventId: number | null; groupId: number | null } | undefined> {
  const rows =
    'admin' in by
      ? await sql<Array<{ event_id: number | null; group_id: number | null }>>`
          delete from song_club_posts where id = ${id} returning event_id, group_id`
      : await sql<Array<{ event_id: number | null; group_id: number | null }>>`
          delete from song_club_posts where id = ${id} and member_id = ${by.memberId}
          returning event_id, group_id`;
  if (!rows[0]) return undefined;
  return {
    eventId: rows[0].event_id === null ? null : Number(rows[0].event_id),
    groupId: rows[0].group_id === null ? null : Number(rows[0].group_id),
  };
}

export async function getPins(): Promise<ClubPin[]> {
  const rows = await sql<
    Array<{
      id: number;
      member_id: number | null;
      from_admin: boolean;
      member_name: string | null;
      avatar_url: string | null;
      kind: ClubPinKind;
      title: string;
      url: string | null;
      r2_key: string | null;
      content_type: string | null;
      size_bytes: number | null;
      featured: boolean;
      created_at: string;
    }>
  >`
    select p.id, p.member_id, p.from_admin, m.name as member_name, m.avatar_url, p.kind,
           p.title, p.url, p.r2_key, p.content_type, p.size_bytes, p.featured,
           p.created_at::text as created_at
    from song_club_pins p
    left join users m on m.id = p.member_id
    order by p.featured desc, p.created_at desc, p.id desc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    memberId: r.member_id === null ? null : Number(r.member_id),
    fromAdmin: r.from_admin,
    authorName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
    avatarUrl: r.from_admin ? null : r.avatar_url,
    kind: r.kind,
    title: r.title,
    // Migrated file pins download through the session-gated route; embeds and
    // links (and un-migrated files) keep their stored URL.
    url: r.kind === 'file' && r.r2_key ? `/api/club/file/${Number(r.id)}` : r.url ?? '',
    contentType: r.content_type,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    featured: r.featured,
    createdAt: r.created_at,
  }));
}

// For the gated file route: storage pointers of a FILE pin (null for
// embed/link pins — those aren't ours to serve).
export async function getPinFileRef(
  id: number
): Promise<{ r2Key: string | null; url: string | null } | null> {
  const [row] = await sql<Array<{ kind: string; r2_key: string | null; url: string | null }>>`
    select kind, r2_key, url from song_club_pins where id = ${id}
  `;
  if (!row || row.kind !== 'file') return null;
  return { r2Key: row.r2_key, url: row.url };
}

export async function createPin(input: {
  author: number | 'admin';
  kind: ClubPinKind;
  title: string;
  // File pins uploaded to the private bucket carry r2Key and no url;
  // embed/link pins (and legacy files) carry a real http(s) url.
  url?: string | null;
  r2Key?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  featured?: boolean;
}): Promise<boolean> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return false;
  if (input.kind === 'file') {
    if (!input.r2Key && !isValidHttpUrl(input.url ?? '')) return false;
  } else if (!isValidHttpUrl(input.url ?? '')) {
    return false;
  }
  // Only the admin curates the featured slot at the top of the portal.
  const featured = input.author === 'admin' && input.featured === true;
  await sql`
    insert into song_club_pins
      (member_id, from_admin, kind, title, url, r2_key, content_type, size_bytes, featured)
    values (${input.author === 'admin' ? null : input.author}, ${input.author === 'admin'},
            ${input.kind}, ${title}, ${input.url ?? null}, ${input.r2Key ?? null},
            ${input.contentType ?? null}, ${input.sizeBytes ?? null}, ${featured})
  `;
  return true;
}

// Admin-only (the routes enforce it): promote a pin to the featured block at
// the top of the portal, or demote it back into the regular pinned list.
export async function setPinFeatured(id: number, featured: boolean): Promise<boolean> {
  const result = await sql`
    update song_club_pins set featured = ${featured} where id = ${id}
  `;
  return result.count > 0;
}

export async function deletePin(
  id: number,
  by: { memberId: number } | { admin: true }
): Promise<boolean> {
  const result =
    'admin' in by
      ? await sql`delete from song_club_pins where id = ${id}`
      : await sql`delete from song_club_pins where id = ${id} and member_id = ${by.memberId}`;
  return result.count > 0;
}
