import type { ArchiveSet, Night, Photo, Release, SetMedia } from './types';

// Placeholder nights for /redesign/archive?sample — the same role as
// app/redesign/home/sample.ts: check the layout against the design when the
// real data can't exercise it. Lineups follow the Figma archive mockup
// (259:15993) and BH-260904 matches Home's sample. Display-only: media has no
// youtube ids or photo urls (players render still panels, photos render tiles)
// and outbound links are '#'.
//
// Media completeness is deliberately mixed so every render path runs:
//   full set-level media (video, audio, photos, notes)    BH-260904
//   a set with two videos ("Also from this set")           BH-260904
//   a release from one set (BHV-004) and from the night    BH-260904
//   video on a set that isn't first in running order       BH-260911
//   night-level photos + Bandcamp, per-set video only      BH-260725, BH-260905
//   night-level photos only                                BH-260917
//   set-level photos only / notes only                     BH-260906, BH-251018
//   no media at all                                        BH-251206
//   Song Club, a date range with no sets                   SC-006

const photos = (n: number, credit?: string): Photo[] =>
  Array.from({ length: n }, () => ({ credit }));

// Sets in running order; `slug` from the band name, as the live adapter does
// for bands with no Birdhaus slug.
// The fourth element is the set's media plus its notes / releases.
type SetExtras = SetMedia & { notes?: string; releases?: Release[] };

function sets(
  ...rows: Array<[band: string, start: string, durationSec?: number, extras?: SetExtras]>
): ArchiveSet[] {
  return rows.map(([band, start, durationSec, extras = {}], i) => {
    const { notes, releases, ...media } = extras;
    const slug = band.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return { order: i + 1, band, bandSlug: slug, slug, start, durationSec, media, notes, releases };
  });
}

const CAMERAS = ['Sam Brekke', 'Nora Lindqvist', 'Desmond Ruiz'];

export const SAMPLE_NIGHTS: Night[] = [
  {
    id: 'BH-260918',
    kind: 'bh',
    date: '2026-09-18',
    sets: sets(
      ['Michael Gay', '20:00', 1980, { video: {}, photos: photos(14, 'Jess Ortiz') }],
      ['Jodie Jones', '20:45', 2160, { video: {}, photos: photos(11, 'Jess Ortiz') }],
      ['Ross Thorn', '21:30', 2460, { video: {}, photos: photos(19, 'Jess Ortiz') }]
    ),
    media: {},
    credits: { sound: 'Ben Ostrander', cameraCount: 3, cameras: CAMERAS, channels: 18, photos: ['Jess Ortiz'] },
  },
  {
    id: 'BH-260917',
    kind: 'bh',
    date: '2026-09-17',
    sets: sets(['Losing Dogs', '20:00'], ['Abalone', '20:45'], ['Kacie Jewel Hill', '21:30']),
    media: { photos: photos(42, 'Maya Feld') },
    credits: { sound: 'Ben Ostrander', photos: ['Maya Feld'] },
  },
  {
    id: 'SC-006',
    kind: 'sc',
    date: '2026-09-16',
    endDate: '2026-09-25',
    title: 'Song-a-Day V5 [online]',
    sets: [],
    media: {},
    credits: {},
  },
  {
    id: 'BH-260911',
    kind: 'bh',
    date: '2026-09-11',
    sets: sets(
      ['Wish Wash', '20:00', undefined, { notes: 'First show with a drummer.' }],
      [
        'Guest Rooms',
        '20:45',
        2310,
        {
          video: {},
          notes: 'Setlist: Checkout Time, Ice Machine, Do Not Disturb, Continental Breakfast, Late Fee.',
        },
      ],
      ['Modern Wildlife', '21:30', undefined, { notes: 'Played with a string section.' }]
    ),
    media: {},
    credits: { sound: 'Dana Whitcomb', cameraCount: 3, cameras: CAMERAS.slice(0, 2), channels: 18 },
  },
  {
    id: 'BH-260906',
    kind: 'bh',
    date: '2026-09-06',
    sets: sets(
      ['Grant Whiteoak', '19:30'],
      ['JG Shadid', '20:15', undefined, { photos: photos(9, 'Maya Feld') }],
      ['Into It, Over It', '21:00', undefined, { photos: photos(23, 'Maya Feld') }]
    ),
    media: {},
    credits: { sound: 'Ben Ostrander', photos: ['Maya Feld'] },
  },
  {
    id: 'BH-260905',
    kind: 'bh',
    date: '2026-09-05',
    sets: sets(
      ['Kate Malanaphy', '20:00', 1890, { video: {} }],
      ['Megasound', '20:45', 2520, { video: {} }]
    ),
    media: {
      photos: photos(31, 'Jess Ortiz'),
      audio: [{ bandcamp: '#', title: 'Live at the Birdhaus, 5 Sep 2026' }],
    },
    credits: { sound: 'Dana Whitcomb', cameraCount: 3, cameras: CAMERAS, channels: 18, photos: ['Jess Ortiz'] },
  },
  {
    id: 'BH-260904',
    kind: 'bh',
    date: '2026-09-04',
    sets: sets(
      ['Ducksmithson', '20:00', 1740, { photos: photos(8, 'Jess Ortiz') }],
      [
        'Cassandra Johnson',
        '20:45',
        2040,
        { video: {}, notes: 'Played with a string section.' },
      ],
      [
        'Joe Kaplow',
        '21:30',
        1872,
        {
          video: { durationSec: 1872 },
          moreVideos: [{ title: 'Lake Street (encore, phone camera)' }],
          audio: { bandcamp: '#', title: 'Joe Kaplow — Live at the Birdhaus' },
          notes:
            'Setlist: Basement Light, Powderhorn, Dial Tone, Every Other Sunday, Long Exposure, Ceiling Fan, Goodnight, Lake Street.',
          releases: [{ id: 'BHV-004', title: 'Joe Kaplow — Live at the Birdhaus', url: '#' }],
          photos: photos(26, 'Jess Ortiz'),
        },
      ]
    ),
    media: {},
    credits: { sound: 'Ben Ostrander', cameraCount: 3, cameras: CAMERAS, channels: 18, photos: ['Jess Ortiz'] },
    releases: [{ id: 'BHR-012', title: 'Birdhaus 4 Sep 2026 — the whole night (cassette)', url: '#' }],
  },
  {
    id: 'BH-260725',
    kind: 'bh',
    date: '2026-07-25',
    freshCuts: 10,
    sets: sets(
      ['Hey Arlo', '19:30', 1260, { video: {} }],
      ['Beech Montana', '20:00', 1320],
      ['Joe Kaplow', '20:30', 1410, { video: {} }],
      ['Bornguesser', '21:00', 1500]
    ),
    media: {
      photos: photos(57, 'Maya Feld'),
      audio: [{ bandcamp: '#', title: 'Fresh Cuts 010 — first listens' }],
    },
    credits: { sound: 'Dana Whitcomb', cameraCount: 3, cameras: CAMERAS.slice(0, 2), channels: 18, photos: ['Maya Feld'] },
    releases: [{ id: 'BHR-011', title: 'Fresh Cuts 010 (cassette comp)', url: '#' }],
  },
  {
    id: 'BH-251206',
    kind: 'bh',
    date: '2025-12-06',
    sets: sets(['Headtriiip', '20:00'], ['Megasound', '21:00']),
    media: {},
    credits: { sound: 'Ben Ostrander' },
  },
  {
    id: 'BH-251018',
    kind: 'bh',
    date: '2025-10-18',
    freshCuts: 8,
    sets: sets(
      ['Ducksmithson', '19:30', undefined, { notes: 'All new songs, per Fresh Cuts rules.' }],
      ['Cassandra Johnson', '20:00', undefined, { notes: 'Solo, first time playing these out.' }],
      ['Hey Arlo', '20:30']
    ),
    media: { photos: photos(18, 'Jess Ortiz') },
    credits: { sound: 'Dana Whitcomb', photos: ['Jess Ortiz'] },
  },
];
