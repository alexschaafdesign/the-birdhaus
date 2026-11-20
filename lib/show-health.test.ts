import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeIssues, categoriesFor, todosByTab, type ShowHealthFacts } from './show-health.ts';
import { buildBoardFromSchedule } from './schedule-board.ts';

const base: ShowHealthFacts = {
  id: 1,
  slug: 's',
  title: 'T',
  date: '2027-01-08',
  announced: false,
  flyer: null,
  target_band_count: 3,
  band_count: 1,
  advance_sent: false,
};

test('upcoming show: issues land on the tab that fixes them', () => {
  assert.deepEqual(todosByTab(base, '2027-01-01'), { overview: 1, advance: 1, lineup: 1 });
});

test('dismissed issues are not to-dos', () => {
  const show = { ...base, ignored_health_checks: ['flyer', 'bands'] };
  const keys = activeIssues(show, '2027-01-01', categoriesFor(show, '2027-01-01')).map((i) => i.key);
  assert.deepEqual(keys, ['advance']);
});

test('past show only gets post-show checks', () => {
  const show = { ...base, band_count: 2, bands_paid_count: 1, bands_with_video_count: 2 };
  assert.deepEqual(todosByTab(show, '2027-02-01'), { settlement: 1 });
});

test('auto board drops load-in/soundchecks and mutes doors', () => {
  const rows = buildBoardFromSchedule([
    { time: '5:00pm', label: 'Load-in' },
    { time: '5:30pm', label: 'Band A soundcheck' },
    { time: '7:00pm', label: 'Doors' },
    { time: '7:30pm', label: 'Band A' },
  ]);
  assert.deepEqual(rows, [
    { time: '7:00pm', label: 'Doors', secondary: true },
    { time: '7:30pm', label: 'Band A' },
  ]);
});
