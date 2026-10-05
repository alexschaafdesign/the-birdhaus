import Link from 'next/link';
import type { ComponentProps } from 'react';

// Birdhaus DS primitive — Content / Recording Card (Figma 223:9433). One
// recorded set: a 16:9 thumbnail, then catalogue ID + duration, then the act.
// ID is Data/Caption 13 Bold in accent-red, duration Data/Timecode 15, act
// UI/Nav Item 14. The whole card is one link.
//
// The thumbnail is surface-paper-shade with a centred play mark (Figma Icon /
// play, as a currentColor mask). In Figma it's still bound to the retired
// wash/red, which no longer exists; paper-shade is the DS's "quiet panel on
// paper" token. Drop a still in via `thumbnail` and it covers the panel. The
// play mark then sits on a paper square so it reads over any image.
// Duration is optional (we don't store set lengths yet). No hex or px here.
// ground="ink" is for a card inside an ink band: secondary text, the ID in
// accent-brick (the one red on ink), and a raised-ink panel.

export type RecordingCardProps = Omit<ComponentProps<typeof Link>, 'children'> & {
  catalogueId: string;
  title: string;
  duration?: string;
  /** Still image URL; covers the paper-shade panel. */
  thumbnail?: string;
  ground?: 'paper' | 'ink';
};

export function RecordingCard({
  catalogueId,
  title,
  duration,
  thumbnail,
  ground = 'paper',
  className = '',
  ...props
}: RecordingCardProps) {
  const ink = ground === 'ink';
  return (
    <Link
      {...props}
      className={
        `group ${ink ? 'text-text-secondary' : 'text-text-primary'} flex min-w-0 flex-col gap-2 ` +
        'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        className
      }
    >
      <span className={`${ink ? 'bg-surface-ink-raised' : 'bg-surface-paper-shade'} relative flex aspect-video w-full items-center justify-center overflow-hidden`}>
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        )}
        <span
          aria-hidden
          className={`relative flex items-center justify-center ${thumbnail ? 'bg-surface-paper p-2' : ''}`}
        >
          <span className="block size-4 bg-current mask-[url(/redesign/icons/play.svg)] mask-contain mask-center mask-no-repeat group-hover:bg-accent-red" />
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className={`text-data-caption-13-bold ${ink ? 'text-accent-brick' : 'text-accent-red'} truncate font-bold leading-[1.4] tracking-[--spacing(0.375)]`}>
          {catalogueId}
        </span>
        {duration && (
          <span className="text-timecode shrink-0 leading-[1.2] tracking-[--spacing(0.125)]">
            {duration}
          </span>
        )}
      </span>
      <span className="text-ui-nav-item-14 truncate leading-[1.3] tracking-[--spacing(0.25)] uppercase">
        {title}
      </span>
    </Link>
  );
}

export default RecordingCard;
