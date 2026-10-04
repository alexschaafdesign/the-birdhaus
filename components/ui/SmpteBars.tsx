import type { ComponentProps } from 'react';

// Birdhaus DS primitive — Chassis / SMPTE Bars. Equal-width bands in band order,
// from the --color-bars-* tokens (Figma aliases: 1-ink, the five spectrum/*
// colours, 7-paper). Three counts:
//   6 — the default: the coloured bar under the logo.
//   7 — adds bars-7-paper. That band is the paper ground itself, so it's only
//       visible off paper (the Figma ALL variant hides it on paper).
//   1 — just bars-1-ink: the plain section rule.
// Thickness is the spacing scale: m = h-1 (4px), s = h-0.5 (2px). Width comes
// from the parent (w-full). Decorative, so aria-hidden. No hex or px here.

export type SmpteBandCount = 1 | 6 | 7;
type Size = 's' | 'm';

// Literal class strings so Tailwind's scanner generates each utility.
const BANDS = [
  'bg-bars-1-ink',
  'bg-bars-2-violet',
  'bg-bars-3-magenta',
  'bg-bars-4-red',
  'bg-bars-5-orange',
  'bg-bars-6-amber',
  'bg-bars-7-paper',
] as const;

const SIZES: Record<Size, string> = { s: 'h-0.5', m: 'h-1' };

export type SmpteBarsProps = Omit<ComponentProps<'div'>, 'children'> & {
  bands?: SmpteBandCount;
  size?: Size;
};

export function SmpteBars({ bands = 6, size = 'm', className = '', ...props }: SmpteBarsProps) {
  // aria-hidden after the spread so a caller can't un-hide a decorative mark.
  return (
    <div {...props} className={`flex w-full ${SIZES[size]} ${className}`} aria-hidden="true">
      {BANDS.slice(0, bands).map((bg) => (
        <div key={bg} className={`h-full min-w-px flex-1 ${bg}`} />
      ))}
    </div>
  );
}

export default SmpteBars;
