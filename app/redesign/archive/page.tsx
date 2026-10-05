import type { Metadata } from 'next';
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
  tickOf,
  timecode,
} from '@/lib/archive';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ShowRow } from '@/components/ui/ShowRow';
import { RecordingCard } from '@/components/ui/RecordingCard';
import { ArchiveFrame, NightBand } from './_components/ArchiveFrame';

// 2027 Archive — every night, newest first (Figma bones: 259:15993). Preview
// only, same as /redesign/home: not linked from the live site, noindex, and
// app/sitemap.ts (a curated list) never includes it. ?sample renders the
// fixture nights (lib/archive/fixtures.ts). The live /archive is untouched.

export const metadata: Metadata = {
  title: 'Archive (2027 preview)',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RECORDING_COUNT = 5;

export default async function ArchiveIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sample = params.sample !== undefined;
  const nights = await getNights(sample);
  const months = byMonth(nights);
  const recordings = latestRecordings(nights, RECORDING_COUNT);

  return (
    <ArchiveFrame stats={nights.length ? archiveTotals(nights) : null}>
      <section className="flex max-w-3xl flex-col gap-3">
        <h1 className="sr-only">Birdhaus archive</h1>
        <SectionHeader label="Archive" rule="none" />
        <p className="text-body-3 leading-normal">
          We record every set we can — 18 channels and more than one camera — and staff
          photographers shoot select nights. Choose a night to see whatever survives from it:
          video, audio, setlists, photos.
        </p>
      </section>

      {/* ---- latest recordings: an ink night band, newest sets with video. */}
      {recordings.length > 0 && (
        <NightBand label="Latest recordings">
          <SectionHeader label="Latest recordings" ground="ink" rule="none" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {recordings.map(({ night, set }) => {
              const sec = set.durationSec ?? set.media.video?.durationSec;
              const youtube = set.media.video?.youtube;
              return (
                <RecordingCard
                  key={`${night.id}-${set.slug}`}
                  ground="ink"
                  href={archiveHref(`/redesign/archive/${night.id}#${set.slug}`, sample)}
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
        <SectionHeader label="Past shows" count={nights.length} rule="none" />
        {months.length === 0 ? (
          <p className="text-body-1">Nothing in the archive yet.</p>
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
                    href={archiveHref(`/redesign/archive/${night.id}`, sample)}
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
    </ArchiveFrame>
  );
}
