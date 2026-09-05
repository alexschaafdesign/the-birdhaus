import { sql } from './db';

// Curated image pool for the /tv CRT display (069_tv_images.sql). A standalone
// folder of images the tube cycles through in idle "dead air" — separate from
// show-derived flyers/photos. Managed at /admin/tv-images.

export interface TvImage {
  id: number;
  url: string;
  caption: string | null;
  sort: number;
  active: boolean;
}

// Active pool for the public /tv feed, in display order.
export async function getActiveTvImages(): Promise<Array<{ url: string; caption: string | null }>> {
  const rows = await sql<Array<{ url: string; caption: string | null }>>`
    select url, caption
    from tv_images
    where active = true
    order by sort asc, id asc
  `;
  return rows.map((r) => ({ url: r.url, caption: r.caption }));
}

// Full pool for the admin manager (active and parked), in display order.
export async function getAllTvImages(): Promise<TvImage[]> {
  const rows = await sql<
    Array<{ id: number; url: string; caption: string | null; sort: number; active: boolean }>
  >`
    select id, url, caption, sort, active
    from tv_images
    order by sort asc, id asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    url: r.url,
    caption: r.caption,
    sort: Number(r.sort),
    active: r.active,
  }));
}
