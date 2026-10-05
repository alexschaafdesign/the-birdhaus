import Link from 'next/link';
import type { ArchiveSet, Night } from '@/lib/archive';
import { archiveHref, setSummary } from '@/lib/archive';
import { AudioLink, Duration, PhotoStrip, Setlist, VideoPlayer } from './Media';

// One set in the night band, anchored at #slug. A set with media is a native
// <details> (no client JS): the night's first set with video renders open,
// the rest collapse to one line that says what exists ("photos only"). A set
// with nothing of its own is a plain line — no disclosure, no empty player.

const ROW =
  'flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4 sm:flex-nowrap';

function Heading({ set, summary }: { set: ArchiveSet; summary: string | null }) {
  return (
    <>
      <span className="text-timecode text-text-meta w-6 shrink-0 tabular-nums">
        {String(set.order).padStart(2, '0')}
      </span>
      <span className="text-data-set-time-20 text-text-muted w-14 shrink-0 tabular-nums">
        {set.start ?? '—'}
      </span>
      <h3 className="text-header-4 text-text-inverse min-w-0 flex-1 leading-[1.2] uppercase">
        {set.band}
      </h3>
      <span className="text-data-spec-12 text-text-meta order-last flex basis-full items-center gap-3 pl-24 tracking-[--spacing(0.25)] uppercase sm:order-none sm:basis-auto sm:pl-0">
        <Duration sec={set.durationSec} />
        {summary ?? 'no media yet'}
      </span>
    </>
  );
}

export function SetBlock({
  night,
  set,
  open,
  others,
  sample,
}: {
  night: Night;
  set: ArchiveSet;
  open: boolean;
  others: Array<{ night: Night; set: ArchiveSet }>;
  sample: boolean;
}) {
  const summary = setSummary(set);
  // The targeted set (#slug) tints its heading row only, so raised-ink photo
  // tiles inside it stay visible.
  const anchor = 'border-line-ink scroll-mt-6 border-t';

  if (!summary) {
    return (
      <div id={set.slug} className={`${anchor} ${ROW} target:bg-surface-ink-raised`}>
        <Heading set={set} summary={null} />
      </div>
    );
  }

  const { video, audio, photos, setlist } = set.media;
  const label = `${set.band}, ${night.id}`;

  return (
    <details id={set.slug} open={open} className={`group ${anchor} [&:target>summary]:bg-surface-ink-raised`}>
      <summary
        className={`${ROW} focus-visible:outline-accent-brick cursor-pointer list-none focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden`}
      >
        <Heading set={set} summary={summary} />
        <span
          aria-hidden
          className="text-text-muted text-body-2 shrink-0"
        >
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>

      <div className="flex max-w-6xl flex-col gap-6 pb-8 sm:pl-24">
        {(video || setlist || audio) && (
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8">
            {video && <VideoPlayer video={video} label={label} />}
            {(setlist?.length || audio) && (
              <div className="flex flex-col gap-6">
                {audio && <AudioLink audio={audio} />}
                {setlist?.length ? <Setlist songs={setlist} /> : null}
              </div>
            )}
          </div>
        )}
        {photos?.length ? <PhotoStrip photos={photos} label={set.band} /> : null}

        <p className="text-data-spec-12 text-text-meta flex flex-wrap gap-x-3 gap-y-1 tracking-[--spacing(0.25)] uppercase">
          {others.length ? (
            <>
              <span>Other Birdhaus sets:</span>
              {others.map(({ night: n, set: s }) => (
                <Link
                  key={`${n.id}-${s.slug}`}
                  href={archiveHref(`/redesign/archive/${n.id}#${s.slug}`, sample)}
                  className="text-accent-brick hover:text-text-inverse focus-visible:outline-accent-brick font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {n.id}
                </Link>
              ))}
            </>
          ) : (
            <span>First Birdhaus set</span>
          )}
        </p>
      </div>
    </details>
  );
}
