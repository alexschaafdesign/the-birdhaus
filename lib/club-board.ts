// Song Club portal board — the shared message thread and the pinned
// files/embeds/links above it. Everything here is members-only; the callers
// (app/club pages + /api/club routes) have already authenticated a member
// session or the admin session before touching this module.

import { sql } from './db';
import { isValidHttpUrl } from './club-embed';

export interface ClubPost {
  id: number;
  memberId: number | null;
  fromAdmin: boolean;
  authorName: string;
  body: string;
  createdAt: string;
}

export type ClubPinKind = 'file' | 'embed' | 'link';

export interface ClubPin {
  id: number;
  memberId: number | null;
  fromAdmin: boolean;
  authorName: string;
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
export async function getPosts(): Promise<ClubPost[]> {
  const rows = await sql<
    Array<{
      id: number;
      member_id: number | null;
      from_admin: boolean;
      member_name: string | null;
      body: string;
      created_at: string;
    }>
  >`
    select p.id, p.member_id, p.from_admin, m.name as member_name, p.body,
           p.created_at::text as created_at
    from song_club_posts p
    left join users m on m.id = p.member_id
    order by p.created_at asc, p.id asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    memberId: r.member_id === null ? null : Number(r.member_id),
    fromAdmin: r.from_admin,
    authorName: r.from_admin ? 'the Birdhaus' : r.member_name ?? 'Former member',
    body: r.body,
    createdAt: r.created_at,
  }));
}

// author: a member id, or 'admin' for a Birdhaus post.
export async function createPost(
  author: number | 'admin',
  body: string
): Promise<boolean> {
  const trimmed = body.trim().slice(0, MAX_POST_LENGTH);
  if (!trimmed) return false;
  await sql`
    insert into song_club_posts (member_id, from_admin, body)
    values (${author === 'admin' ? null : author}, ${author === 'admin'}, ${trimmed})
  `;
  return true;
}

// Members may delete their own posts; the admin may delete any.
export async function deletePost(
  id: number,
  by: { memberId: number } | { admin: true }
): Promise<boolean> {
  const result =
    'admin' in by
      ? await sql`delete from song_club_posts where id = ${id}`
      : await sql`delete from song_club_posts where id = ${id} and member_id = ${by.memberId}`;
  return result.count > 0;
}

export async function getPins(): Promise<ClubPin[]> {
  const rows = await sql<
    Array<{
      id: number;
      member_id: number | null;
      from_admin: boolean;
      member_name: string | null;
      kind: ClubPinKind;
      title: string;
      url: string;
      content_type: string | null;
      size_bytes: number | null;
      featured: boolean;
      created_at: string;
    }>
  >`
    select p.id, p.member_id, p.from_admin, m.name as member_name, p.kind,
           p.title, p.url, p.content_type, p.size_bytes, p.featured,
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
    kind: r.kind,
    title: r.title,
    url: r.url,
    contentType: r.content_type,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    featured: r.featured,
    createdAt: r.created_at,
  }));
}

export async function createPin(input: {
  author: number | 'admin';
  kind: ClubPinKind;
  title: string;
  url: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  featured?: boolean;
}): Promise<boolean> {
  const title = input.title.trim().slice(0, 200);
  if (!title || !isValidHttpUrl(input.url)) return false;
  // Only the admin curates the featured slot at the top of the portal.
  const featured = input.author === 'admin' && input.featured === true;
  await sql`
    insert into song_club_pins
      (member_id, from_admin, kind, title, url, content_type, size_bytes, featured)
    values (${input.author === 'admin' ? null : input.author}, ${input.author === 'admin'},
            ${input.kind}, ${title}, ${input.url},
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
