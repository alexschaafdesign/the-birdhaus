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

test('show times come from the schedule: doors row and first set', async () => {
  const { timesFromSchedule, scheduleStartTime } = await import('./schedule-board.ts');
  assert.equal(scheduleStartTime('8–8:30pm'), '8:00pm');
  assert.equal(scheduleStartTime('10:45 PM'), '10:45pm');
  assert.equal(scheduleStartTime('TBD'), null);
  assert.deepEqual(
    timesFromSchedule([
      { time: '4:00pm', label: 'Sound engineer arrives — bands can start loading in' },
      { time: '4:30pm', label: 'Ray Gun Youth soundcheck' },
      { time: '7pm', label: 'Doors' },
      { time: '8–8:30pm', label: 'Lent' },
      { time: '11pm', label: 'House clear' },
    ]),
    { doorsTime: '7:00pm', showTime: '8:00pm' }
  );
  assert.deepEqual(timesFromSchedule([]), { doorsTime: null, showTime: null });
});
