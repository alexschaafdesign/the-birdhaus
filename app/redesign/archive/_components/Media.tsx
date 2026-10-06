import type { Audio, Photo, Video } from '@/lib/archive';
import { timecode } from '@/lib/archive';

// Media pieces for the ink night band. Only rendered when the media exists —
// callers never pass an empty player.

const FOCUS =
  'focus-visible:outline-accent-brick focus-visible:outline-2 focus-visible:outline-offset-2';

// A 16:9 YouTube embed. Inside a closed <details> it isn't rendered, so the
// lazy iframe doesn't load until its set is opened. Without a youtube id
// (?sample fixtures) it's a still panel with the play mark.
export function VideoPlayer({ video, label }: { video: Video; label: string }) {
  if (!video.youtube) {
    return (
      <div className="bg-surface-ink-raised flex aspect-video w-full items-center justify-center">
        <span
          aria-hidden
          className="bg-text-muted block size-6 mask-[url(/redesign/icons/play.svg)] mask-contain mask-center mask-no-repeat"
        />
        <span className="sr-only">Video: {label}</span>
      </div>
    );
  }
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${video.youtube}`}
      title={video.title || label}
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      className="aspect-video w-full border-0"
    />
  );
}

const STRIP = 6;

// Up to six tiles; the last one carries "+N" for the rest. Tiles without a url
// (?sample) render as raised-ink placeholders.
export function PhotoStrip({ photos, label }: { photos: Photo[]; label: string }) {
  const shown = photos.slice(0, STRIP);
  const extra = photos.length - shown.length;
  const credits = [...new Set(photos.map((p) => p.credit).filter(Boolean))];
  return (
    <figure className="flex flex-col gap-2">
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-6">
        {shown.map((p, i) => {
          const last = i === shown.length - 1 && extra > 0;
          return (
            <li
              key={p.url ?? i}
              className={`bg-surface-ink-raised relative aspect-square overflow-hidden ${i >= 3 ? 'hidden sm:block' : ''}`}
            >
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
              )}
              {/* On mobile the third tile is the last visible one, so it
                  carries the count for everything hidden. */}
              {(last || (i === 2 && photos.length > 3)) && (
                <span
                  className={`bg-surface-ink/70 text-text-inverse text-data-catalogue-id-16 absolute inset-0 flex items-center justify-center font-bold ${last ? '' : 'sm:hidden'}`}
                >
                  +{last ? extra : photos.length - 3}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <figcaption className="text-data-spec-12 text-text-meta leading-[1.45] tracking-[--spacing(0.25)] uppercase">
        {photos.length} {photos.length === 1 ? 'photo' : 'photos'} · {label}
        {credits.length > 0 && ` · ${credits.join(', ')}`}
      </figcaption>
    </figure>
  );
}

export function AudioLink({ audio }: { audio: Audio }) {
  return (
    <a
      href={audio.bandcamp}
      target={audio.bandcamp.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={`text-body-3 text-text-inverse hover:text-accent-brick flex items-center gap-2 font-bold uppercase ${FOCUS}`}
    >
      <span
        aria-hidden
        className="block size-3.5 shrink-0 bg-current mask-[url(/redesign/icons/play.svg)] mask-contain mask-center mask-no-repeat"
      />
      <span className="min-w-0">
        Bandcamp{audio.title && <span className="text-text-muted font-normal"> — {audio.title}</span>}
      </span>
    </a>
  );
}

// A set's free-text notes (show_bands.notes). Line breaks are kept, so a
// pasted setlist reads as a list without needing structure.
export function Notes({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-data-overline-11 text-text-meta font-bold tracking-[--spacing(0.625)] uppercase">
        Notes
      </p>
      <p className="text-body-3 text-text-secondary leading-normal whitespace-pre-line">{text}</p>
    </div>
  );
}

export function Duration({ sec }: { sec?: number }) {
  if (!sec) return null;
  return <span className="text-timecode text-text-muted tabular-nums">{timecode(sec)}</span>;
}
