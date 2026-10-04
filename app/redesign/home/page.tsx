import type { Metadata } from 'next';
import type { ComponentProps } from 'react';
import { getAllShows, getTodayCentral } from '@/lib/shows';
import type { Show } from '@/lib/shows';
import { bandNames, broadcastDate, catalogueId, shortDate, to24h } from '@/lib/catalogue';
import { NavLink } from '@/components/ui/NavLink';
import { SmpteBars } from '@/components/ui/SmpteBars';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NextShow, type NextShowAct } from '@/components/ui/NextShow';
import { ShowRow } from '@/components/ui/ShowRow';
import { RecordingCard } from '@/components/ui/RecordingCard';
import { DiscoBall } from '@/components/ui/DiscoBall';
import { SAMPLE_NEXT, SAMPLE_RECORDINGS, SAMPLE_ROWS, SAMPLE_STATS } from './sample';

// 2027 Home, composed from the DS primitives in components/ui — Figma THE
// BIRDHAUS, "Home / Desktop 1440 — components" (235:8286). Preview only: not
// linked, noindex, and app/sitemap.ts (a curated list) never includes it. The
// live / and /tv are untouched. ?sample swaps in the mockup's placeholder
// content (./sample.ts) to check the layout against Figma.

export const metadata: Metadata = {
  title: 'Home (2027 preview)',
  robots: { index: false, follow: false },
};

// Upcoming/past split per request, same as the live homepage.
export const dynamic = 'force-dynamic';

const NAV = [
  { label: 'VENUE', href: '/redesign/home', active: true },
  { label: 'ARCHIVE', href: '/archive' },
  // No 2027 routes for these yet.
  { label: 'LABEL', href: '#' },
  { label: 'COMMUNITY', href: '#' },
  { label: 'ABOUT/CONTACT', href: '/contact' },
];

const RECORDING_COUNT = 5;

// Headliner-first: when set times exist the latest set leads; otherwise the
// stored order stands (we can't infer a headliner from it).
function actsFor(show: Show): NextShowAct[] {
  if (show.bands.every((b) => typeof b === 'string')) {
    return bandNames(show).map((name) => ({ name }));
  }
  const bands = show.bands.map((b) =>
    typeof b === 'string' ? { name: b, setStart: undefined } : b
  );
  if (!bands.some((b) => b.setStart)) return bands.map((b) => ({ name: b.name }));
  return bands
    .map((b) => ({ name: b.name, time: to24h(b.setStart) }))
    .sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
}

const details = (doors: string) => `DOORS ${doors} · ENTRY BY DONATION · ALL AGES`;
const SPEC = 'RECORDED LIVE — 18CH / 24-BIT / 48 kHz';

type Model = {
  stats: { bands: number; sets: number } | null;
  next: ComponentProps<typeof NextShow> | null;
  rows: Array<ComponentProps<typeof ShowRow> & { key: string }>;
  recordings: Array<ComponentProps<typeof RecordingCard> & { key: string }>;
};

const SAMPLE: Model = {
  stats: SAMPLE_STATS,
  next: {
    ...SAMPLE_NEXT,
    details: details(SAMPLE_NEXT.doors),
    spec: SPEC,
    action: { href: '#', label: 'RSVP' },
  },
  rows: SAMPLE_ROWS.map((r) => ({ ...r, href: '#' })),
  recordings: SAMPLE_RECORDINGS.map((r) => ({ ...r, href: '#' })),
};

async function liveModel(): Promise<Model> {
  const shows = await getAllShows();
  const today = getTodayCentral();

  const upcoming = shows
    .filter((s) => s.date >= today && s.announced === true)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0] ?? null;

  const past = shows
    .filter((s) => s.date < today && (s.type ?? 'show') === 'show')
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    stats: past.length
      ? {
          bands: new Set(past.flatMap((s) => bandNames(s).map((n) => n.toLowerCase()))).size,
          sets: past.reduce((n, s) => n + s.bands.length, 0),
        }
      : null,
    next: next && {
      date: broadcastDate(next.date),
      dateTime: next.date,
      catalogueId: catalogueId(next.date),
      acts: actsFor(next),
      details: details(to24h(next.doorsTime) ?? '19:00'),
      spec: SPEC,
      action: { href: `/shows/${next.slug}`, label: 'RSVP' },
    },
    rows: upcoming.slice(1).map((show) => ({
      key: String(show.id),
      href: `/shows/${show.slug}`,
      catalogueId: catalogueId(show.date),
      date: shortDate(show.date),
      lineup: bandNames(show).join(' · ') || show.title,
    })),
    recordings: past
      .flatMap((show) => show.videos.map((video) => ({ show, video })))
      .slice(0, RECORDING_COUNT)
      .map(({ show, video }) => ({
        key: `${show.id}-${video.youtube}`,
        href: `/shows/${show.slug}`,
        catalogueId: catalogueId(show.date),
        title: video.title || bandNames(show).join(' · ') || show.title,
        thumbnail: `https://i.ytimg.com/vi/${video.youtube}/mqdefault.jpg`,
      })),
  };
}

export default async function RedesignHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sample } = await searchParams;
  const { stats, next, rows, recordings } = sample !== undefined ? SAMPLE : await liveModel();

  return (
    <main
      className="bg-surface-paper text-surface-ink font-commit-mono flex min-h-screen flex-col gap-8 overflow-x-clip px-4 pt-6 pb-12 sm:px-8"
      style={{ WebkitTextStroke: 0 }}
    >
      {/* ---- header ---------------------------------------------------- */}
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="flex w-fit max-w-full flex-col gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/redesign/birdhaus-logo.svg"
              alt="Birdhaus"
              width={389}
              height={62}
              className="h-auto max-w-full"
            />
            <SmpteBars />
          </div>
          <nav aria-label="Main" className="flex flex-wrap gap-x-8.5 gap-y-2">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                href={item.href}
                active={item.active}
                className={`pt-1 pb-1.5 leading-[1.3] ${item.active ? 'border-accent-red border-b-2' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="text-body-3 flex flex-wrap justify-between gap-x-8 gap-y-1">
          <p className="leading-normal">A HUMBLE DIY MUSIC EMPIRE IN SOUTH MINNEAPOLIS</p>
          {stats && (
            <p className="text-accent-red leading-[1.5] font-bold">
              {stats.bands} BANDS · {stats.sets} SETS
            </p>
          )}
        </div>
      </header>

      {/* ---- the space ------------------------------------------------- */}
      <section aria-label="The space" className="text-body-1 flex flex-col gap-1.5 leading-normal">
        <p>The Birdhaus is a DIY basement venue in South Minneapolis.</p>
        <p>Holds about sixty people. Donation at the door. All ages.</p>
        <p>Every set is captured on 18 channels and multiple cameras.</p>
        <p>RSVP to an event to receive the address and other details.</p>
      </section>

      {/* ---- next show + ball ------------------------------------------ */}
      <section className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:gap-8">
        <div className="flex flex-col gap-6">
          <SectionHeader label="Next show" rule="m" />
          {next ? (
            <NextShow {...next} />
          ) : (
            <p className="text-body-1">No shows on the books right now. Check back soon.</p>
          )}
        </div>
        {/* Hangs from above the section, as in the mockup; desktop only. In
            flow, so the section is always tall enough to hold it. */}
        <div className="pointer-events-none hidden lg:-mt-27 lg:block lg:pl-6">
          <DiscoBall />
        </div>
      </section>

      {/* ---- upcoming -------------------------------------------------- */}
      {rows.length > 0 && (
        <section className="flex flex-col gap-6">
          <SectionHeader label="Upcoming" count={rows.length} />
          <div className="flex flex-col">
            {rows.map(({ key, ...row }) => (
              <ShowRow key={key} {...row} />
            ))}
          </div>
          <SmpteBars bands={1} size="s" />
        </section>
      )}

      {/* ---- latest recordings ----------------------------------------- */}
      {recordings.length > 0 && (
        <section className="flex flex-col gap-6">
          <SectionHeader label="Latest recordings" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {recordings.map(({ key, ...card }) => (
              <RecordingCard key={key} {...card} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
