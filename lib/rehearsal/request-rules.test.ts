import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBandCancel, parseRequestBody, paymentMethodsOffered, MAX_BLOCKS_PER_REQUEST } from './request-rules.ts';

const S = { gearOptions: ['Drum kit', 'Vocal mics'], squareEnabled: false, cashEnabled: false };
const A = '2026-11-19T00:00:00.000Z';
const B = '2026-11-21T18:00:00.000Z';

test('a valid request: sorted, de-duplicated, gear normalised to the list spelling', () => {
  const r = parseRequestBody(
    { starts: [B, A, B], note: '  first time here ', gearNeeded: ['vocal MICS', 'Drum kit'], gearNotes: ' 2 mics ' },
    S,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.value.starts.map((d) => d.toISOString()), [A, B]);
  assert.equal(r.value.note, 'first time here');
  assert.deepEqual(r.value.gearNeeded, ['Vocal mics', 'Drum kit']);
  assert.equal(r.value.gearNotes, '2 mics');
  assert.equal(r.value.paymentMethod, 'venmo');
});

test('gear is optional', () => {
  const r = parseRequestBody({ starts: [A] }, S);
  assert.ok(r.ok);
  assert.deepEqual(r.value.gearNeeded, []);
  assert.equal(r.value.gearNotes, '');
});

test('rejects empty, too many, bad dates, unknown gear and long notes', () => {
  assert.equal(parseRequestBody({ starts: [] }, S).ok, false);
  assert.equal(parseRequestBody(null, S).ok, false);
  const many = Array.from({ length: MAX_BLOCKS_PER_REQUEST + 1 }, (_, i) => new Date(Date.UTC(2026, 11, i + 1)).toISOString());
  assert.equal(parseRequestBody({ starts: many }, S).ok, false);
  assert.equal(parseRequestBody({ starts: ['not a date'] }, S).ok, false);
  assert.equal(parseRequestBody({ starts: [A], gearNeeded: ['Theremin'] }, S).ok, false);
  assert.equal(parseRequestBody({ starts: [A], note: 'x'.repeat(2001) }, S).ok, false);
  assert.equal(parseRequestBody({ starts: [A], gearNotes: 'x'.repeat(501) }, S).ok, false);
});

test('only offered payment methods are accepted', () => {
  assert.deepEqual(paymentMethodsOffered(S), ['venmo']);
  assert.equal(parseRequestBody({ starts: [A], paymentMethod: 'cash' }, S).ok, false);
  const withCash = { ...S, cashEnabled: true };
  assert.deepEqual(paymentMethodsOffered({ ...withCash, squareEnabled: true }), ['venmo', 'square', 'cash']);
  const r = parseRequestBody({ starts: [A], paymentMethod: 'cash' }, withCash);
  assert.ok(r.ok && r.value.paymentMethod === 'cash');
});

test('cancel allowed until the cutoff, only for pending/confirmed', () => {
  const now = new Date('2026-11-16T15:00:00Z');
  const startsAt = new Date('2026-11-18T15:00:00Z'); // exactly 48h away
  assert.equal(canBandCancel({ status: 'confirmed', startsAt }, now, 48), true);
  assert.equal(canBandCancel({ status: 'pending', startsAt }, now, 49), false);
  assert.equal(canBandCancel({ status: 'declined', startsAt }, now, 0), false);
  assert.equal(canBandCancel({ status: 'cancelled', startsAt }, now, 0), false);
});
