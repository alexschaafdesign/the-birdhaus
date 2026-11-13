import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRule, nthOfMonth, occurrenceDates, occurrenceStarts, MAX_OCCURRENCES } from './series.ts';

test('weekly by count includes the anchor', () => {
  assert.deepEqual(occurrenceDates('2026-11-18', { freq: 'weekly', count: 4 }), [
    '2026-11-18',
    '2026-11-25',
    '2026-12-02',
    '2026-12-09',
  ]);
});

test('every other week until a date (inclusive)', () => {
  assert.deepEqual(occurrenceDates('2026-11-18', { freq: 'biweekly', until: '2026-12-16' }), [
    '2026-11-18',
    '2026-12-02',
    '2026-12-16',
  ]);
});

test('monthly on the nth weekday', () => {
  // 2026-11-17 is the 3rd Tuesday of November.
  assert.equal(nthOfMonth('2026-11-17'), 3);
  assert.equal(describeRule('2026-11-17', 'monthly_nth'), 'Monthly on the 3rd Tuesday');
  assert.deepEqual(occurrenceDates('2026-11-17', { freq: 'monthly_nth', count: 4 }), [
    '2026-11-17',
    '2026-12-15',
    '2027-01-19',
    '2027-02-16',
  ]);
});

test('a 5th weekday anchor becomes "the last"', () => {
  // 2026-12-29 is the 5th (and last) Tuesday of December.
  assert.equal(describeRule('2026-12-29', 'monthly_nth'), 'Monthly on the last Tuesday');
  assert.deepEqual(occurrenceDates('2026-12-29', { freq: 'monthly_nth', count: 3 }), [
    '2026-12-29',
    '2027-01-26', // January has 4 Tuesdays; the last is the 26th
    '2027-02-23',
  ]);
});

test('labels for weekly and every other week', () => {
  assert.equal(describeRule('2026-11-18', 'weekly'), 'Weekly on Wednesdays');
  assert.equal(describeRule('2026-11-18', 'biweekly'), 'Every other Wednesday');
});

test('occurrences are capped', () => {
  assert.equal(occurrenceDates('2026-11-18', { freq: 'weekly', count: 500 }).length, MAX_OCCURRENCES);
  assert.equal(occurrenceDates('2026-11-18', { freq: 'weekly', until: '2030-01-01' }).length, MAX_OCCURRENCES);
});

test('6pm Chicago stays 6pm across the DST change', () => {
  const starts = occurrenceStarts(new Date('2027-03-02T00:00:00Z'), { freq: 'weekly', count: 3 }); // Mon 1 Mar 6pm CST
  assert.deepEqual(
    starts.map((d) => d.toISOString()),
    ['2027-03-02T00:00:00.000Z', '2027-03-09T00:00:00.000Z', '2027-03-15T23:00:00.000Z'], // 15 Mar is CDT
  );
});
