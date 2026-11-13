import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signLink, verifyLink } from './signed-links.ts';
import { venmoMemo, venmoPayUrl } from './venmo.ts';
import { buildIcs, foldLine } from './ics-out.ts';
import { parseBusyTimes } from './ics.ts';

const SECRET = 'test-secret-not-real';
const NOW = new Date('2026-11-16T15:00:00Z');

test('signed links round-trip and carry their target', () => {
  const t = signLink({ a: 'approve', k: 'abcDEF12345' }, SECRET, NOW);
  const r = verifyLink(t, SECRET, NOW);
  assert.ok(r.ok);
  assert.equal(r.payload.a, 'approve');
  assert.equal(r.payload.k, 'abcDEF12345');
  const one = verifyLink(signLink({ a: 'decline', b: 42 }, SECRET, NOW), SECRET, NOW);
  assert.ok(one.ok && one.payload.b === 42);
});

test('tampered, wrong-secret and malformed links are invalid', () => {
  const t = signLink({ a: 'decline', k: 'abcDEF12345' }, SECRET, NOW);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ a: 'approve', k: 'abcDEF12345', e: 9e9 })).toString('base64url');
  assert.deepEqual(verifyLink(`${forged}.${sig}`, SECRET, NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyLink(t, 'other-secret', NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyLink(body, SECRET, NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyLink('', SECRET, NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyLink(`${t}.x`, SECRET, NOW), { ok: false, reason: 'invalid' });
});

test('links expire after 7 days', () => {
  const t = signLink({ a: 'approve', k: 'abcDEF12345' }, SECRET, NOW);
  assert.ok(verifyLink(t, SECRET, new Date(NOW.getTime() + 7 * 86400e3 - 1000)).ok);
  assert.deepEqual(verifyLink(t, SECRET, new Date(NOW.getTime() + 7 * 86400e3 + 1000)), { ok: false, reason: 'expired' });
});

test('a link names a request or a booking, not both', () => {
  assert.throws(() => signLink({ a: 'approve', k: 'abcDEF12345', b: 1 }, SECRET, NOW));
  assert.throws(() => signLink({ a: 'approve' }, SECRET, NOW));
});

test('Venmo memo and link', () => {
  assert.equal(venmoMemo('RH-261114b', '  The   Cowbells '), 'RH-261114b · The Cowbells');
  const url = venmoPayUrl('@thebirdhaus', 6000, 'RH-261114 · The Cowbells');
  assert.equal(url, 'https://venmo.com/thebirdhaus?txn=pay&amount=60.00&note=RH-261114%20%C2%B7%20The%20Cowbells');
  assert.ok(venmoMemo('RH-261114', 'x'.repeat(300)).length <= 140);
});

test('.ics output parses back to the same times and folds long lines', () => {
  const start = new Date('2026-11-19T00:00:00Z');
  const end = new Date('2026-11-19T03:00:00Z');
  const ics = buildIcs(
    [
      {
        uid: 'rh-1@thebirdhaus.org',
        start,
        end,
        summary: 'Rehearsal, the BIRDHAUS; RH-261118',
        location: '3721 17th Ave S, Minneapolis',
        description: 'Line one\nLine two '.repeat(10),
      },
    ],
    { now: NOW },
  );
  assert.ok(ics.includes('\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(ics.includes('SUMMARY:Rehearsal\\, the BIRDHAUS\\; RH-261118'));
  const back = parseBusyTimes(ics, new Date('2026-11-01Z'), new Date('2026-12-01Z'));
  assert.deepEqual(back, [{ start, end }]);
});

test('folding never splits a multi-byte character', () => {
  const line = 'SUMMARY:' + '·'.repeat(60);
  const folded = foldLine(line);
  assert.equal(folded.split('\r\n ').join(''), line);
});
