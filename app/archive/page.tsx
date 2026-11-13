import type { Metadata } from 'next';
import Link from 'next/link';
import { SONGHAUS_URL } from '@/lib/site';
import { getFreshCutsContent } from '@/lib/page-content';
import { isAdminSession } from '@/lib/admin-session';
import {
  archiveHref,
  archiveTotals,
  byMonth,
  getNights,
  ledgerDate,
  latestRecordings,
  lineup,
  monthLabel,
  nightSummary,
  seriesOf,
  tickOf,
  timecode,
  type SeriesFilter,
} from '@/lib/archive';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ShowRow } from '@/components/ui/ShowRow';
import { RecordingCard } from '@/components/ui/RecordingCard';
import { SiteFrame, NightBand } from '@/components/night/SiteFrame';
import { Filters } from '@/components/night/Filters';
import { FRESH_CUTS_NAV_PATH } from '@/components/night/nav';
import FreshCutsIntro from '@/components/FreshCutsIntro';

// The archive: every night, newest first (Figma bones: 259:15993). Each row
// opens the night's one page, /shows/BH-…. ?sample renders the
// fixture nights (lib/archive/fixtures.ts) to check the layout.
// ?series=fc is the Fresh Cuts view (/fresh-cuts 308s here): it opens with the
// series' editable intro instead of the archive's, and lights FRESH CUTS in
// the nav.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  if (one((await searchParams).series) === 'fc') {
    return {
      title: 'Fresh Cuts',
      description:
        'Fresh Cuts is the Birdhaus series for brand-new material from Twin Cities artists, every set recorded.',
      alternates: { canonical: '/archive?series=fc' },
    };
  }
  return {
    title: 'Archive',
    description:
      'Every night at the Birdhaus, newest first — recorded on 18 channels and more than one camera.',
    alternates: { canonical: '/archive' },
  };
}

export const dynamic = 'force-dynamic';

const RECORDING_COUNT = 5;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
const isSeries = (v: string | null): v is SeriesFilter => v === 'bh' || v === 'fc';

export default async function ArchiveIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sample = params.sample !== undefined;
  const nights = await getNights(sample);
  const recordings = latestRecordings(nights, RECORDING_COUNT);

  // Filters narrow the ledger only; totals and Latest recordings stay whole.
  // Unknown values are ignored rather than emptying the list.
  const years = [...new Set(nights.map((n) => n.date.slice(0, 4)))];
  const yearParam = one(params.year);
  const year = yearParam && years.includes(yearParam) ? yearParam : null;
  const seriesParam = one(params.series);
  const series = isSeries(seriesParam) ? seriesParam : null;
  const shown = nights.filter(
    (n) => (!year || n.date.startsWith(year)) && (!series || seriesOf(n) === series)
  );
  const months = byMonth(shown);
  const freshCuts = series === 'fc';
  const [fcContent, isAdmin] = freshCuts
    ? await Promise.all([getFreshCutsContent(), isAdminSession()])
    : [null, false];

  return (
    <SiteFrame
      stats={nights.length ? archiveTotals(nights) : null}
      navPath={freshCuts ? FRESH_CUTS_NAV_PATH : undefined}
    >
      {fcContent ? (
        <FreshCutsIntro content={fcContent} isAdmin={isAdmin} />
      ) : (
        <section className="flex max-w-3xl flex-col gap-3">
          <h1 className="sr-only">Birdhaus archive</h1>
          <SectionHeader label="Archive" rule="none" />
          <p className="text-body-3 leading-normal">
            We record every set we can — 18 channels and more than one camera — and staff
            photographers shoot select nights. Choose a night to see whatever survives from it:
            video, audio, photos, notes.
          </p>
        </section>
      )}

      {/* ---- latest recordings: an ink night band, newest sets with video.
          Not on Fresh Cuts: these sets mostly aren't Fresh Cuts, and the strip
          would read as if they were. */}
      {!freshCuts && recordings.length > 0 && (
        <NightBand label="Latest recordings">
          <SectionHeader label="Latest recordings" ground="ink" rule="none" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {recordings.map(({ night, set }) => {
              const sec = set.durationSec ?? set.media.video?.durationSec;
              const youtube = set.media.video?.youtube;
              return (
                <RecordingCard
                  key={set.id}
                  ground="ink"
                  href={archiveHref(`/shows/${night.id}#${set.id}`, sample)}
                  catalogueId={night.id}
                  title={set.band}
                  duration={sec ? timecode(sec) : undefined}
                  thumbnail={youtube ? `https://i.ytimg.com/vi/${youtube}/mqdefault.jpg` : undefined}
                />
              );
            })}
          </div>
        </NightBand>
      )}

      <section className="flex flex-col gap-6">
        <SectionHeader label="Past shows" count={shown.length} rule="none" />
        {nights.length > 0 && (
          <Filters years={years} year={year} series={series} sample={sample} />
        )}
        {/* Song-a-day editions (SAD-###) are minted and listed by Songhaus.
            /bands has no nav item, so the archive is where it's linked. */}
        <p className="text-body-3 flex flex-wrap gap-x-6 gap-y-1">
          <Link href="/bands" className="hover:text-accent-brick underline underline-offset-4">
            All bands →
          </Link>
          <a
            href={SONGHAUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent-brick underline underline-offset-4"
          >
            Song-a-day editions live on Songhaus →
          </a>
        </p>
        {months.length === 0 ? (
          <p className="text-body-1">
            {nights.length === 0 ? 'Nothing in the archive yet.' : 'No nights match those filters.'}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {months.map(({ key, nights: monthNights }) => (
              <section key={key} aria-label={monthLabel(key)} className="flex flex-col">
                {/* Sticky month label: stays pinned while its rows scroll. */}
                <SectionHeader
                  as="h3"
                  label={monthLabel(key)}
                  className="bg-surface-paper sticky top-0 z-10 pt-3 pb-1"
                />
                {monthNights.map((night) => (
                  <ShowRow
                    key={night.id}
                    href={archiveHref(`/shows/${night.id}`, sample)}
                    catalogueId={night.id}
                    series={tickOf(night)}
                    date={ledgerDate(night)}
                    lineup={lineup(night)}
                    meta={nightSummary(night)}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
    </SiteFrame>
  );
}
