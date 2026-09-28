import { unstable_cache } from 'next/cache';
import { sql } from './db';
import { getProgram, getGlobalProgram, getActiveCards } from './tv-program';
import type { TvProgram } from './tv-program';
import { getActiveTvImages } from './tv-images';

// The in-venue kiosk polls /api/tv once a minute, 24/7. If every poll hit
// Postgres the Neon prod compute could never idle-suspend (scale to zero). So
// the DB reads behind the normal (no-preview) feed are wrapped in the Data
// Cache here: steady-state polls read the cache and touch no DB, and the
// compute is free to sleep.
//
// IMPORTANT — this cache is invalidated ONLY by tags, never by a short timer
// (a short timer would wake the DB on a schedule, defeating the point). Every
// write path that changes what this feed returns MUST call
// `revalidateTag(TV_FEED_TAG, { expire: 0 })` after a successful write. The
// { expire: 0 } form expires immediately, so the very next kiosk poll re-reads
// the DB and shows the change (a bare/`'max'` profile is stale-while-
// revalidate and would show the OLD value for one more poll — don't use it).
//
// Write paths that MUST invalidate (keep this list in sync when adding one):
//   - app/api/admin/tv-program/route.ts            PATCH  (program save)
//   - app/api/admin/tv-cards/route.ts              POST   (create card)
//   - app/api/admin/tv-cards/[id]/route.ts         PATCH, DELETE
//   - app/api/admin/tv-images/route.ts             POST   (create image)
//   - app/api/admin/tv-images/[id]/route.ts        PATCH, DELETE
//   - app/api/admin/tv-presets/[id]/apply/route.ts POST   (applyPreset writes
//                                                   tv_images/tv_cards/tv_program)
//   - app/api/admin/shows/route.ts                 POST   (a show dated today
//                                                   changes tonight's program)
//   - app/api/admin/shows/[id]/route.ts            PATCH (date can change),
//                                                   DELETE
// Not invalidated on purpose (don't feed the tube): preset create/rename/delete;
// non-date shows writes (square, tokens, photos, advance, sound-engineer);
// the sync-twinscene-bands cron; offline scripts (import-shows etc. run with no
// request context — the safety TTL below covers their staleness).
export const TV_FEED_TAG = 'tv-feed';

// Safety net only — correctness comes from the tags above. Hours, not minutes:
// a minutes-scale revalidate would wake Neon on a fixed schedule 24/7. At 6h a
// missed invalidation self-heals with at most ~4 brief DB touches a day, so the
// compute still gets ~24h of idle windows and scales to zero between them.
const SAFETY_TTL_SECONDS = 6 * 60 * 60;

export interface TvFeedData {
  // Raw program row (override kept UNRESOLVED: overrideMode + overrideExpiresAt
  // are both here so the handler can decide `overrideActive` live, off-cache).
  program: TvProgram;
  // The scope whose program/cards are live: the show id if it has a program,
  // else null (global).
  scope: number | null;
  // Active cards / screensaver pool, raw URLs (the handler rewrites them to the
  // 640px variants). "active" is a stored boolean flag in SQL — no now()/date
  // filtering lives in these reads, so it's safe to cache them whole.
  cards: Array<{ headline: string; subtext: string | null; image: string | null }>;
  pool: Array<{ url: string; caption: string | null }>;
}

// The DB half of the feed for a given venue-day (`today`). No time-dependent
// decision happens in here — the date is the cache key, and override
// expiry/date rollover are resolved by the caller.
async function loadTvFeed(today: string): Promise<TvFeedData> {
  const [showRow] = await sql<Array<{ id: number }>>`
    select id from shows where date = ${today} order by id asc limit 1
  `;
  const showId = showRow ? Number(showRow.id) : null;
  const showProgram = showId !== null ? await getProgram(showId) : null;
  const scope = showProgram ? showId : null;
  const program = showProgram ?? (await getGlobalProgram());

  const [cards, pool] = await Promise.all([getActiveCards(scope), getActiveTvImages()]);
  return { program, scope, cards, pool };
}

// `today` is passed as an argument (not just closed over) so it lands in the
// unstable_cache invocation key — a new venue-day is a distinct entry, so
// midnight rollover reads the new day's show with no invalidation needed.
const cachedLoadTvFeed = unstable_cache(loadTvFeed, ['tv-feed'], {
  tags: [TV_FEED_TAG],
  revalidate: SAFETY_TTL_SECONDS,
});

export function getCachedTvFeed(today: string): Promise<TvFeedData> {
  return cachedLoadTvFeed(today);
}
