import { createHash } from 'node:crypto';
import { sql } from '../db';
import { isStaging, logStaging } from '../staging';
import { fetchFeed } from './busy-fetch.ts';
import type { BusyTimes, Interval } from './availability.ts';

// Busy times from every configured .ics feed, cached ~15 minutes per feed in
// rehearsal_busy_cache (migration 111). If any feed can't be read, the blocks
// it would have removed stay open and `checked` is false, which the request
// flow turns into a "couldn't check calendar" flag on the approval email.
//
// Reading the calendar is outbound but read-only and contacts no one, so it
// runs on staging too (decision 8); it's logged there via lib/staging.ts.

const FRESH_MS = 15 * 60_000;
const FAILED_RETRY_MS = 2 * 60_000; // don't hammer a broken feed on every page view
const DAY_MS = 86_400_000;
// Fetch a little wider than asked so a moving "now" doesn't force a refetch.
const PAD_BEFORE_MS = DAY_MS;
const PAD_AFTER_MS = 7 * DAY_MS;

export interface FeedStatus {
  index: number; // position in settings.ics_feed_urls
  ok: boolean;
  error: string; // short label ('timeout', 'http_404', 'parse', …), '' when ok
  fetchedAt: string;
  busyCount: number; // busy intervals in the requested span
}

interface CacheRow {
  fetched_at: Date;
  ok: boolean;
  intervals: Array<[string, string]>;
  covers_from: Date;
  covers_to: Date;
  error: string;
}

export function feedHash(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

function clip(list: Interval[], from: Date, to: Date): Interval[] {
  return list.filter((iv) => iv.end.getTime() > from.getTime() && iv.start.getTime() < to.getTime());
}

export async function getBusyTimes(
  urls: string[],
  from: Date,
  to: Date,
  opts: { now?: Date; force?: boolean } = {},
): Promise<{ busy: BusyTimes; feeds: FeedStatus[] }> {
  const now = opts.now ?? new Date();
  if (urls.length === 0) return { busy: { intervals: [], checked: true }, feeds: [] };

  let fetched = 0;
  const results = await Promise.all(
    urls.map(async (url, index) => {
      const hash = feedHash(url);
      const [row] = await sql<CacheRow[]>`
        select fetched_at, ok, intervals, covers_from, covers_to, error
        from rehearsal_busy_cache
        where feed_hash = ${hash}
      `;
      const age = row ? now.getTime() - row.fetched_at.getTime() : Infinity;
      const usable =
        row &&
        !opts.force &&
        (row.ok
          ? age < FRESH_MS && row.covers_from <= from && row.covers_to >= to
          : age < FAILED_RETRY_MS);

      if (usable) {
        const intervals = clip(
          row.intervals.map(([s, e]) => ({ start: new Date(s), end: new Date(e) })),
          from,
          to,
        );
        return { index, ok: row.ok, error: row.error, fetchedAt: row.fetched_at.toISOString(), intervals };
      }

      fetched += 1;
      const coversFrom = new Date(from.getTime() - PAD_BEFORE_MS);
      const coversTo = new Date(to.getTime() + PAD_AFTER_MS);
      const result = await fetchFeed(url, coversFrom, coversTo);
      const pairs: Array<[string, string]> = result.ok
        ? result.intervals.map((iv) => [iv.start.toISOString(), iv.end.toISOString()])
        : [];
      const error = result.ok ? '' : result.error;
      if (!result.ok) console.warn(`[rehearsal-busy] feed ${index + 1} failed: ${error}`);

      await sql`
        insert into rehearsal_busy_cache (feed_hash, fetched_at, ok, intervals, covers_from, covers_to, error)
        values (${hash}, ${now}, ${result.ok}, ${sql.json(pairs)}, ${coversFrom}, ${coversTo}, ${error})
        on conflict (feed_hash) do update set
          fetched_at = excluded.fetched_at,
          ok = excluded.ok,
          intervals = excluded.intervals,
          covers_from = excluded.covers_from,
          covers_to = excluded.covers_to,
          error = excluded.error
      `;
      return {
        index,
        ok: result.ok,
        error,
        fetchedAt: now.toISOString(),
        intervals: result.ok ? clip(result.intervals, from, to) : [],
      };
    }),
  );

  if (fetched > 0) {
    // Feeds removed from settings shouldn't leave their busy times behind.
    await sql`delete from rehearsal_busy_cache where feed_hash <> all(${urls.map(feedHash)}::text[])`;
    if (isStaging()) {
      logStaging('rehearsal ics fetch', { feeds: fetched, failed: results.filter((r) => !r.ok).length });
    }
  }

  return {
    busy: { intervals: results.flatMap((r) => r.intervals), checked: results.every((r) => r.ok) },
    feeds: results.map(({ index, ok, error, fetchedAt, intervals }) => ({
      index,
      ok,
      error,
      fetchedAt,
      busyCount: intervals.length,
    })),
  };
}
