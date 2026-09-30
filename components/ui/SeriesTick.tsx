import type { ComponentProps } from 'react';

// Birdhaus DS primitive — Content / Series Tick (Figma 176:169). A single SMPTE
// bar colour placed before a catalogue ID: BH grey (everyday), FC yellow,
// Video cyan (BHV/BT), Tape green (BHR), Song Club magenta. One saturated note
// per piece; bar red and blue are never series colours.
//
// Colour comes from the --color-series-* tokens (Figma aliases of bars/*); the
// 6×14 box is the spacing scale (w-1.5 / h-3.5). No hex or px literals here.
// Purely decorative — the catalogue ID beside it carries the meaning — so it's
// aria-hidden and a <span> that sits inline with that text.

export type Series = 'bh' | 'fc' | 'video' | 'tape' | 'song-club';

const BASE = 'inline-block h-3.5 w-1.5 shrink-0 rounded-none';

// Literal class strings so Tailwind's scanner generates each utility.
const SERIES: Record<Series, string> = {
  bh: 'bg-series-bh',
  fc: 'bg-series-fc',
  video: 'bg-series-video',
  tape: 'bg-series-tape',
  'song-club': 'bg-series-song-club',
};

export type SeriesTickProps = Omit<ComponentProps<'span'>, 'children'> & { series?: Series };

export function SeriesTick({ series = 'bh', className = '', ...props }: SeriesTickProps) {
  // aria-hidden after the spread so a caller can't un-hide a decorative mark.
  return (
    <span {...props} className={`${BASE} ${SERIES[series]} ${className}`} aria-hidden="true" />
  );
}

export default SeriesTick;
