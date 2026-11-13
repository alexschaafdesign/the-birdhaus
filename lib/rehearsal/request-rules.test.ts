import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canBandCancel,
  parseRequestBody,
  paymentMethodsOffered,
  planRequest,
  MAX_ITEMS_PER_REQUEST,
  type RequestItem,
} from './request-rules.ts';

const S = { gearOptions: ['Drum kit', 'Vocal mics'], squareEnabled: false, cashEnabled: false };
const A = '2026-11-19T00:00:00.000Z'; // Wed 18 Nov 6pm Chicago
const B = '2026-11-21T18:00:00.000Z'; // Sat 21 Nov noon

test('items: one-offs and repeats, sorted and de-duplicated; gear normalised', () => {
  const r = parseRequestBody(
    {
      items: [{ start: B }, { start: A, repeat: { freq: 'weekly', count: 4 } }, { start: B }],
      note: '  first time here ',
      gearNeeded: ['vocal MICS', 'Drum kit'],
      gearNotes: ' 2 mics ',
    },
    S,
  );
  assert.ok(r.ok);
  assert.deepEqual(
    r.value.items.map((i) => [i.start.toISOString(), i.repeat]),
    [
      [A, { freq: 'weekly', count: 4 }],
      [B, null],
    ],
  );
  assert.equal(r.value.note, 'first time here');
  assert.deepEqual(r.value.gearNeeded, ['Vocal mics', 'Drum kit']);
  assert.equal(r.value.gearNotes, '2 mics');
  assert.equal(r.value.paymentMethod, 'venmo');
});

test('rejects empty, too many, bad dates, unknown gear and long notes', () => {
  assert.equal(parseRequestBody({ items: [] }, S).ok, false);
  assert.equal(parseRequestBody(null, S).ok, false);
  const many = Array.from({ length: MAX_ITEMS_PER_REQUEST + 1 }, (_, i) => ({
    start: new Date(Date.UTC(2026, 11, i + 1)).toISOString(),
  }));
  assert.equal(parseRequestBody({ items: many }, S).ok, false);
  assert.equal(parseRequestBody({ items: [{ start: 'not a date' }] }, S).ok, false);
  assert.equal(parseRequestBody({ items: [{ start: A }], gearNeeded: ['Theremin'] }, S).ok, false);
  assert.equal(parseRequestBody({ items: [{ start: A }], note: 'x'.repeat(2001) }, S).ok, false);
  assert.equal(parseRequestBody({ items: [{ start: A }], gearNotes: 'x'.repeat(501) }, S).ok, false);
});

test('repeat needs a frequency and exactly one of until/count', () => {
  const ok = (repeat: unknown) => parseRequestBody({ items: [{ start: A, repeat }] }, S).ok;
  assert.equal(ok({ freq: 'monthly_nth', until: '2027-02-01' }), true);
  assert.equal(ok({ freq: 'daily', count: 3 }), false);
  assert.equal(ok({ freq: 'weekly' }), true); // open-ended
  assert.equal(ok({ freq: 'weekly', count: 3, until: '2027-01-01' }), false);
  assert.equal(ok({ freq: 'weekly', count: 1 }), false);
  assert.equal(ok({ freq: 'weekly', until: '2026-11-01' }), false);
});

test('only offered payment methods are accepted', () => {
  assert.deepEqual(paymentMethodsOffered(S), ['venmo']);
  assert.equal(parseRequestBody({ items: [{ start: A }], paymentMethod: 'cash' }, S).ok, false);
  const withCash = { ...S, cashEnabled: true };
  assert.deepEqual(paymentMethodsOffered({ ...withCash, squareEnabled: true }), ['venmo', 'square', 'cash']);
  const r = parseRequestBody({ items: [{ start: A }], paymentMethod: 'cash' }, withCash);
  assert.ok(r.ok && r.value.paymentMethod === 'cash');
});

test('planRequest: repeats skip what is not open, shared dates book once, closed picks are refused', () => {
  const open = new Set([A, '2026-11-26T00:00:00.000Z', '2026-12-10T00:00:00.000Z', B].map((x) => new Date(x).getTime()));
  const windowEnd = new Date('2026-12-15T00:00:00Z');
  const items: RequestItem[] = [
    { start: new Date(A), repeat: { freq: 'weekly', count: 5 } }, // 18 Nov, 25, 2 Dec, 9 Dec, 16 Dec
    { start: new Date('2026-11-26T00:00:00.000Z'), repeat: null }, // also the repeat's 2nd date
    { start: new Date(B), repeat: null },
    { start: new Date('2026-11-28T18:00:00Z'), repeat: null }, // not open
  ];
  const plan = planRequest(items, (d) => open.has(d.getTime()), windowEnd);
  assert.deepEqual(
    plan.sessions.map((x) => [x.start.toISOString(), x.item, x.repeat]),
    [
      [A, 0, true],
      [B, 2, false],
      ['2026-11-26T00:00:00.000Z', 0, true],
      ['2026-12-10T00:00:00.000Z', 0, true],
    ],
  );
  assert.deepEqual(
    plan.skipped.map((x) => [x.start.toISOString(), x.why]),
    [['2026-12-03T00:00:00.000Z', 'unavailable']],
  );
  assert.deepEqual(plan.later, [1, 0, 0, 0]); // 16 Dec is past the window: booked later, after approval
  assert.deepEqual(plan.closed, [3]);
});

test('cancel allowed until the cutoff, only for pending/confirmed', () => {
  const now = new Date('2026-11-16T15:00:00Z');
  const startsAt = new Date('2026-11-18T15:00:00Z'); // exactly 48h away
  assert.equal(canBandCancel({ status: 'confirmed', startsAt }, now, 48), true);
  assert.equal(canBandCancel({ status: 'pending', startsAt }, now, 49), false);
  assert.equal(canBandCancel({ status: 'declined', startsAt }, now, 0), false);
  assert.equal(canBandCancel({ status: 'cancelled', startsAt }, now, 0), false);
});
