import type { NextShowAct } from '@/components/ui/NextShow';

// The Figma mockup's own placeholder content (235:8286), rendered with
// /redesign/home?sample so the composition can be checked against the design
// even when the DB has nothing upcoming. Display-only; nothing links anywhere.

export const SAMPLE_NEXT = {
  date: 'FRI 04 SEP 2026',
  dateTime: '2026-09-04',
  catalogueId: 'BH-260904',
  acts: [
    { name: 'Joe Kaplow', time: '21:30' },
    { name: 'Cassandra Johnson', time: '20:45' },
    { name: 'Ducksmithson', time: '20:00' },
  ] satisfies NextShowAct[],
  doors: '19:00',
};

export const SAMPLE_ROWS = Array.from({ length: 9 }, (_, i) => ({
  key: `sample-row-${i}`,
  catalogueId: 'BH-260905',
  date: 'SAT 5 SEP',
  lineup: 'Megasound · Kate Malanaphy',
}));

export const SAMPLE_RECORDINGS = Array.from({ length: 5 }, (_, i) => ({
  key: `sample-rec-${i}`,
  catalogueId: 'BH-260904',
  duration: '00:31:12',
  title: 'Joe Kaplow',
}));

export const SAMPLE_STATS = { bands: 98, sets: 134 };
