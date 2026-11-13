import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeed, feedHttpUrl, MAX_FEED_BYTES, type Fetcher } from './busy-fetch.ts';

const FROM = new Date('2026-11-01T00:00:00Z');
const TO = new Date('2027-01-01T00:00:00Z');
const URL_ = 'webcal://p01-caldav.icloud.com/published/2/SECRET';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:x',
  'DTSTAMP:20261101T000000Z',
  'SUMMARY:Dentist',
  'DTSTART:20261120T180000Z',
  'DTEND:20261120T190000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const respond =
  (body: string | null, init: ResponseInit = {}): Fetcher =>
  async () =>
    new Response(body, init);

test('webcal becomes https', () => {
  assert.equal(feedHttpUrl(URL_), 'https://p01-caldav.icloud.com/published/2/SECRET');
  assert.equal(feedHttpUrl('https://a.b/c.ics'), 'https://a.b/c.ics');
});

test('a good feed returns intervals and fetches over https', async () => {
  let seen = '';
  const fetcher: Fetcher = async (url) => {
    seen = url;
    return new Response(ICS, { status: 200 });
  };
  const r = await fetchFeed(URL_, FROM, TO, fetcher);
  assert.ok(r.ok);
  assert.equal(r.intervals.length, 1);
  assert.ok(seen.startsWith('https://'));
});

test('HTTP errors, junk and oversize feeds fail with a short label', async () => {
  assert.deepEqual(await fetchFeed(URL_, FROM, TO, respond('gone', { status: 404 })), { ok: false, error: 'http_404' });
  assert.deepEqual(await fetchFeed(URL_, FROM, TO, respond('<html>login</html>')), { ok: false, error: 'parse' });
  assert.deepEqual(
    await fetchFeed(URL_, FROM, TO, respond(ICS, { headers: { 'content-length': String(MAX_FEED_BYTES + 1) } })),
    { ok: false, error: 'too_large' },
  );
  assert.deepEqual(await fetchFeed(URL_, FROM, TO, respond('x'.repeat(MAX_FEED_BYTES + 10))), {
    ok: false,
    error: 'too_large',
  });
});

test('network failures and timeouts fail, and the label never contains the URL', async () => {
  const boom: Fetcher = async () => {
    throw new TypeError('fetch failed: ' + URL_);
  };
  const r = await fetchFeed(URL_, FROM, TO, boom);
  assert.deepEqual(r, { ok: false, error: 'network' });
  const slow: Fetcher = async () => {
    const e = new Error('timed out');
    e.name = 'TimeoutError';
    throw e;
  };
  assert.deepEqual(await fetchFeed(URL_, FROM, TO, slow), { ok: false, error: 'timeout' });
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});
