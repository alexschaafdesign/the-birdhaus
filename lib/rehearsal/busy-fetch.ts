// Fetch one private .ics feed and turn it into busy intervals. No DB here
// (lib/rehearsal/busy.ts adds the cache), and `fetch` is injectable, so the
// failure handling runs under `npm test`.
//
// Failure labels are short and never contain the URL: they end up in the
// cache row and in logs.

import { parseBusyTimes } from './ics.ts';
import type { Interval } from './availability.ts';

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

export type FeedResult = { ok: true; intervals: Interval[] } | { ok: false; error: string };

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

// webcal:// is just https:// for a calendar app.
export function feedHttpUrl(url: string): string {
  return url.replace(/^webcal:\/\//i, 'https://');
}

async function readCapped(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_FEED_BYTES) return null;
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FEED_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchFeed(url: string, from: Date, to: Date, fetcher: Fetcher = fetch): Promise<FeedResult> {
  let res: Response;
  try {
    res = await fetcher(feedHttpUrl(url), {
      redirect: 'follow',
      cache: 'no-store',
      headers: { accept: 'text/calendar, */*;q=0.5', 'user-agent': 'BirdhausRehearsal/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' };
  }
  if (!res.ok) return { ok: false, error: `http_${res.status}` };

  let text: string | null;
  try {
    text = await readCapped(res);
  } catch {
    return { ok: false, error: 'network' };
  }
  if (text === null) return { ok: false, error: 'too_large' };

  try {
    return { ok: true, intervals: parseBusyTimes(text, from, to) };
  } catch {
    return { ok: false, error: 'parse' };
  }
}
