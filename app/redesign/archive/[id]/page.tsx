import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { broadcastDate } from '@/lib/catalogue';
import { getPhotosFromFolder } from '@/lib/cloudinary';
import {
  archiveHref,
  archiveTotals,
  getNights,
  lineup,
  neighbours,
  openSetSlug,
  otherSets,
  photoCount,
  seriesTag,
  tickOf,
  type Night,
} from '@/lib/archive';
import { NavLink } from '@/components/ui/NavLink';
import { ButtonArrow } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SeriesTick } from '@/components/ui/SeriesTick';
import { ArchiveFrame, NightBand } from '../_components/ArchiveFrame';
import { AudioLink, PhotoStrip, VideoPlayer } from '../_components/Media';
import { SetBlock } from '../_components/SetBlock';
import { OpenOnHash } from '../_components/OpenOnHash';

// 2027 Archive — one night (e.g. /redesign/archive/BH-260904). Preview only,
// same as /redesign/home: not linked from the live site, noindex, and
// app/sitemap.ts (a curated list) never includes it. ?sample renders the
// fixture nights (lib/archive/fixtures.ts).
//
// The header and credits sit on paper; only the media goes dark, in one
// full-width night band: sets in running order, then whatever media belongs
// to the night as a whole (photos and audio are stored per show).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${decodeURIComponent(id)} — Archive (2027 preview)`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

function dateLine(night: Night): string {
  return night.endDate
    ? `${broadcastDate(night.date)} – ${broadcastDate(night.endDate)}`
    : broadcastDate(night.date);
}

function counts(night: Night, photos: number): string {
  const sets = night.sets.length;
  const cameras = night.credits.cameras?.length ?? 0;
  return [
    sets > 0 && `${sets} ${sets === 1 ? 'SET' : 'SETS'}`,
    cameras > 0 && `${cameras} ${cameras === 1 ? 'CAMERA' : 'CAMERAS'}`,
    night.credits.channels && `${night.credits.channels} CH`,
    photos > 0 && `${photos} PHOTOS`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Credit({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
        {label}
      </dt>
      <dd className="text-body-3 leading-normal">{value}</dd>
    </div>
  );
}

export default async function ArchiveNightPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id: rawId }, { sample: sampleParam }] = await Promise.all([params, searchParams]);
  const sample = sampleParam !== undefined;
  const id = decodeURIComponent(rawId).toUpperCase();

  const nights = await getNights(sample);
  const night = nights.find((n) => n.id === id);
  if (!night) notFound();

  // Cloudinary-folder galleries are fetched here only (not on the index).
  const folderPhotos = night.media.photoFolder
    ? (await getPhotosFromFolder(night.media.photoFolder)).map((p) => ({ url: p.url }))
    : [];
  const nightPhotos = [...(night.media.photos ?? []), ...folderPhotos];
  const nightVideos = night.media.videos ?? [];
  const nightAudio = night.media.audio ?? [];
  const hasNightMedia = nightPhotos.length > 0 || nightVideos.length > 0 || nightAudio.length > 0;

  const open = openSetSlug(night);
  const { prev, next } = neighbours(nights, night.id);
  const tag = seriesTag(night);
  const { credits } = night;
  const countLine = counts(night, photoCount(night) + folderPhotos.length);

  return (
    <ArchiveFrame stats={archiveTotals(nights)}>
      <OpenOnHash />
      {/* ---- header, on paper ------------------------------------------ */}
      <header className="flex flex-col gap-4">
        <NavLink href={archiveHref('/redesign/archive', sample)} className="w-fit">
          ← ARCHIVE
        </NavLink>
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2.5">
            <SeriesTick series={tickOf(night)} />
            <span className="text-header-1 text-accent-red leading-none font-bold">{night.id}</span>
            {tag && <span className="text-header-3 leading-none">· {tag}</span>}
          </h1>
          <p className="text-timecode leading-[1.2] tracking-[--spacing(0.125)]">
            <time dateTime={night.date}>{dateLine(night)}</time>
          </p>
        </div>
        <p className="text-header-3 max-w-4xl leading-[1.15] uppercase">{lineup(night)}</p>
        {countLine && (
          <p className="text-data-caption-13-bold text-accent-red leading-[1.4] font-bold tracking-[--spacing(0.375)]">
            {countLine}
          </p>
        )}
      </header>

      {/* ---- the night band: only the media goes dark ------------------- */}
      {(night.sets.length > 0 || hasNightMedia) && (
        <NightBand label="The night">
          {night.sets.length > 0 && (
            <div className="flex flex-col">
              <SectionHeader label="Running order" count={night.sets.length} ground="ink" rule="none" className="pb-4" />
              {night.sets.map((set) => (
                <SetBlock
                  key={set.slug}
                  night={night}
                  set={set}
                  open={set.slug === open}
                  others={otherSets(nights, night, set)}
                  sample={sample}
                />
              ))}
            </div>
          )}

          {hasNightMedia && (
            <div className="border-line-ink flex flex-col gap-6 border-t pt-6">
              <SectionHeader label="From the whole night" ground="ink" rule="none" />
              {nightVideos.map((v, i) => (
                <VideoPlayer key={v.youtube ?? i} video={v} label={`${night.id}, full night`} />
              ))}
              {nightPhotos.length > 0 && <PhotoStrip photos={nightPhotos} label={night.id} />}
              {nightAudio.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {nightAudio.map((a, i) => (
                    <li key={`${a.bandcamp}-${i}`}>
                      <AudioLink audio={a} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </NightBand>
      )}

      {/* ---- credits + releases, on paper ------------------------------- */}
      {(credits.sound || credits.cameras || credits.channels || credits.photos || night.releases) && (
        <section className="flex flex-col gap-6">
          <SectionHeader label="Credits" />
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Credit label="Sound" value={credits.sound} />
            <Credit label="Cameras" value={credits.cameras?.join(', ')} />
            <Credit label="Recorded" value={credits.channels ? `${credits.channels} channels` : undefined} />
            <Credit label="Photos" value={credits.photos?.join(', ')} />
          </dl>
          {night.releases?.length ? (
            <ul className="flex flex-col gap-2">
              {night.releases.map((r) => (
                <li key={r.id}>
                  <a
                    href={r.url}
                    className="text-ui-nav-item-14 ui-hover:text-accent-red focus-visible:outline-accent-red flex items-center gap-2.5 leading-[1.3] tracking-[--spacing(0.25)] uppercase focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <SeriesTick series={r.id.startsWith('BHR') ? 'tape' : 'video'} />
                    <span className="text-data-caption-13-bold text-accent-red font-bold">{r.id}</span>
                    <span className="min-w-0 truncate">{r.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {/* ---- prev / next by ID ----------------------------------------- */}
      <nav aria-label="Other nights" className="border-surface-ink flex justify-between gap-4 border-t-2 pt-4">
        {prev ? (
          <NavLink
            href={archiveHref(`/redesign/archive/${prev.id}`, sample)}
            className="flex items-center gap-2"
            aria-label={`Older night, ${prev.id}`}
          >
            <span className="inline-flex rotate-180">
              <ButtonArrow size="s" />
            </span>
            {prev.id}
          </NavLink>
        ) : (
          <span />
        )}
        {next && (
          <NavLink
            href={archiveHref(`/redesign/archive/${next.id}`, sample)}
            className="flex items-center gap-2"
            aria-label={`Newer night, ${next.id}`}
          >
            {next.id}
            <ButtonArrow size="s" />
          </NavLink>
        )}
      </nav>
    </ArchiveFrame>
  );
}
