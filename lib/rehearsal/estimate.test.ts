import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCents, estimateLine, rateCardLines, weeklyEstimateCents } from './estimate.ts';

const CARD = {
  rateHourlyCents: 2000,
  ratePackages: [
    { minutes: 180, cents: 5000 },
    { minutes: 360, cents: 10000 },
  ],
};

test('cheapest mix of packages and hourly', () => {
  const byHour = [1, 2, 3, 4, 5, 6].map((h) => estimateCents(h * 60, CARD) / 100);
  assert.deepEqual(byHour, [20, 40, 50, 70, 90, 100]);
  assert.equal(estimateCents(90, CARD), 3000); // hourly per half hour
  assert.equal(estimateCents(150, CARD), 5000); // 2.5h: the 3h package beats $50 hourly (tie) — never more
  assert.equal(estimateCents(540, CARD), 15000); // 9h = 6h + 3h
});

test('no packages = hourly; a package can cover a shorter session if cheaper', () => {
  assert.equal(estimateCents(180, { rateHourlyCents: 2000, ratePackages: [] }), 6000);
  assert.equal(estimateCents(120, { rateHourlyCents: 3000, ratePackages: [{ minutes: 180, cents: 5000 }] }), 5000);
});

test('weekly series = 3 of every 4 sessions', () => {
  assert.equal(weeklyEstimateCents(180, CARD), 15000);
});

test('estimate lines', () => {
  assert.equal(estimateLine(180, null, CARD), 'Usual rate for 3 hours: $50');
  assert.equal(estimateLine(60, 'biweekly', CARD), 'Usual rate for 1 hour: $20');
  assert.equal(estimateLine(180, 'weekly', CARD), 'Regular rate: $150 / 4 weeks');
  assert.equal(estimateLine(90, null, CARD), 'Usual rate for 1.5 hours: $30');
});

test('rate card lines', () => {
  assert.deepEqual(rateCardLines(CARD), ['$20 an hour', '3 hours for $50', '6 hours for $100']);
});
