import type { ComponentProps } from 'react';

// Birdhaus DS primitive — Chassis / SMPTE Bars. Equal-width bands in band order,
// from the --color-bars-* tokens (Figma aliases: 1-ink, the five spectrum/*
// colours, 7-paper). Three counts:
//   6 — the default: the coloured bar under the logo.
//   7 — adds bars-7-paper. That band is the paper ground itself, so it's only
//       visible off paper (the Figma ALL variant hides it on paper).
//   1 — just bars-1-ink: the plain section rule.
// variant="logo-rail" is the header rail: amber, orange, red, magenta, violet
// (bars-6 … bars-2), each 1/6 of the logo's width, then a surface-ink rail to
// the end. The rail is the bar's own ink ground, so it fills whatever width is
// left. The logo is the 389-wide wordmark (--spacing(97.25)), capped at the
// rail's width so the bands track the logo when it shrinks on narrow screens;
// a caller can override the span with --logo-rail-span.
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

const RAIL_BANDS = [
  'bg-bars-6-amber',
  'bg-bars-5-orange',
  'bg-bars-4-red',
  'bg-bars-3-magenta',
  'bg-bars-2-violet',
] as const;

const SIZES: Record<Size, string> = { s: 'h-0.5', m: 'h-1' };

export type SmpteBarsProps = Omit<ComponentProps<'div'>, 'children'> & {
  variant?: 'bars' | 'logo-rail';
  /** Band count for the default variant; ignored by logo-rail. */
  bands?: SmpteBandCount;
  size?: Size;
};

export function SmpteBars({
  variant = 'bars',
  bands = 6,
  size = 'm',
  className = '',
  ...props
}: SmpteBarsProps) {
  // aria-hidden after the spread so a caller can't un-hide a decorative mark.
  if (variant === 'logo-rail') {
    return (
      <div
        {...props}
        className={`bg-surface-ink flex w-full ${SIZES[size]} ${className}`}
        aria-hidden="true"
      >
        {RAIL_BANDS.map((bg) => (
          <div
            key={bg}
            className={`h-full w-[calc(var(--logo-rail-span,min(--spacing(97.25),100%))/6)] shrink-0 ${bg}`}
          />
        ))}
      </div>
    );
  }
  return (
    <div {...props} className={`flex w-full ${SIZES[size]} ${className}`} aria-hidden="true">
      {BANDS.slice(0, bands).map((bg) => (
        <div key={bg} className={`h-full min-w-px flex-1 ${bg}`} />
      ))}
    </div>
  );
}

export default SmpteBars;
