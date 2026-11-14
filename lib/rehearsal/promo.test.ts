import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rehearsalPromoLine } from './promo.ts';
import { computeSettlementSummary, DEFAULT_SETTLEMENT_VALUES, settlementEmailSummary } from '../settlements.ts';

const values = { ...DEFAULT_SETTLEMENT_VALUES, incomeCash: 300 };
const summary = computeSettlementSummary(values, 2, [null, null], [null, null]);

test('settlement summary ends with the rehearsal line when given', () => {
  const text = settlementEmailSummary('Some Show', '2026-12-04', values, summary, 2, rehearsalPromoLine('https://www.thebirdhaus.org'));
  const lines = text.split('\n');
  assert.equal(lines.at(-2), '');
  assert.equal(
    lines.at(-1),
    'Need somewhere to practice? The Birdhaus basement is open for band rehearsals: https://www.thebirdhaus.org/rehearsal',
  );
});

test('no rehearsal line by default (public page off)', () => {
  const text = settlementEmailSummary('Some Show', '2026-12-04', values, summary, 2);
  assert.ok(!text.includes('rehearsal'));
  assert.match(text.split('\n').at(-1) ?? '', /^Venue net: /);
});
