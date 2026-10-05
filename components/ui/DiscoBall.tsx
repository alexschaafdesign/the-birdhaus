import { useId, type ComponentProps, type ReactNode } from 'react';
import styles from './DiscoBall.module.css';

// Birdhaus DS primitive — birdhaus-logo-ball, "Default" variant (the Fresh Cuts
// and VHS variants come later). Not the /tv broadcast ball in
// components/broadcast — this one is the 2027 DS version.
//
// Built as in Figma: two rims multiplied onto the ground — rim-blue at the
// back (lower left), rim-red at the front (upper right) — whose overlap is the
// dark body. Three spots are screened on top:
// spot-blue (top), spot-red (left), spot-amber (right), each blurred with
// Figma's grain (fractal noise split into a dark and a light speckle layer).
//
// Colours are fill-* token utilities. The noise floods use ink/paper rather
// than Figma's pure black/white (the DS rule: no pure black, no pure white).
// Geometry is the Figma frame's own units (a 477-wide viewBox cropped to the
// rims), so the ball scales with its container's width. Decorative, so
// aria-hidden.
//
// hang adds the ink mount (9×4 at the 360-wide Figma size, so 2.5% of the
// ball's width at 9:4) and a surface-ink wire dropping from it to the ball.
// The wire's length is the layout's, not the ball's: hang expects the root to
// be a grid subgrid row span (the caller adds grid-rows-subgrid + row-span-N).
// The mount + wire fill every row but the last; the ball sits in the last row,
// --disco-drop below its top (the wire bridges that gap). So the wire runs from
// wherever the span starts — e.g. just under a rail — to the ball, whatever
// the text between them does.
//
// Motion (DiscoBall.module.css, CSS only): the spots drift sideways with page
// scroll (animation-timeline: scroll(), each a different distance, clipped to
// the body — the intersection of the two rims), and the whole ball + wire
// sways ±2° around the mount. Transform-only; the grain filters are never
// animated, and each spot is its own layer so moving it doesn't re-run its
// filter. Off under prefers-reduced-motion; static where scroll timelines
// aren't supported.

// Figma's noise transfer tables: 100 discrete steps, opaque over 17–32 (dark
// speckle) and 67–82 (light speckle).
const table = (from: number, to: number) =>
  Array.from({ length: 100 }, (_, i) => (i >= from && i <= to ? 1 : 0)).join(' ');
const DARK_SPECKLE = table(17, 32);
const LIGHT_SPECKLE = table(67, 82);

function GrainBlur({ id, blur }: { id: string; blur: number }) {
  return (
    <filter
      id={id}
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
      colorInterpolationFilters="sRGB"
    >
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
      <feTurbulence
        type="fractalNoise"
        baseFrequency="1.8928"
        stitchTiles="stitch"
        numOctaves={3}
        seed={1671}
        result="noise"
      />
      <feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
      <feComponentTransfer in="alphaNoise" result="darkNoise">
        <feFuncA type="discrete" tableValues={DARK_SPECKLE} />
      </feComponentTransfer>
      <feComposite operator="in" in="darkNoise" in2="blur" result="darkClipped" />
      <feComponentTransfer in="alphaNoise" result="lightNoise">
        <feFuncA type="discrete" tableValues={LIGHT_SPECKLE} />
      </feComponentTransfer>
      <feComposite operator="in" in="lightNoise" in2="blur" result="lightClipped" />
      <feFlood className="[flood-color:var(--color-surface-ink)]" floodOpacity={0.34} />
      <feComposite operator="in" in2="darkClipped" result="dark" />
      <feFlood className="[flood-color:var(--color-surface-paper)]" floodOpacity={0.21} />
      <feComposite operator="in" in2="lightClipped" result="light" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="dark" />
        <feMergeNode in="light" />
      </feMerge>
    </filter>
  );
}

export type DiscoBallProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** Mount + wire above the ball; needs a subgrid row span (see above). */
  hang?: boolean;
};

// The ball box: 477 × 467 Figma units (the frame cropped to the rims). Every
// layer below shares it, so the spot layers line up with the rims exactly.
const VIEWBOX = '0 98 477 467';

// One screened spot on its own full-ball layer, so moving it is a plain
// transform the compositor can do without re-running the grain filter.
function Spot({
  id,
  blur,
  className,
  children,
}: {
  id: string;
  blur: number;
  className: string;
  children: (filter: string) => ReactNode;
}) {
  return (
    <svg
      viewBox={VIEWBOX}
      fill="none"
      className={`absolute inset-0 size-full ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <GrainBlur id={id} blur={blur} />
      </defs>
      {children(`url(#${id})`)}
    </svg>
  );
}

export function DiscoBall({ hang = false, className = '', ...props }: DiscoBallProps) {
  // useId output can carry characters that aren't valid in url(#…) refs.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ball = (
    <div className="relative w-full">
      {/* rims: back then front, multiplied */}
      <svg
        viewBox={VIEWBOX}
        fill="none"
        className="block h-auto w-full"
        aria-hidden="true"
        focusable="false"
      >
        <ellipse
          cx="226.825"
          cy="338.33"
          rx="226.825"
          ry="226.667"
          className="fill-ball-rim-blue mix-blend-multiply"
        />
        <ellipse
          cx="250.2"
          cy="324.98"
          rx="226.825"
          ry="226.667"
          className="fill-ball-rim-red mix-blend-multiply"
        />
      </svg>

      {/* spots, clipped to the body and screened onto it as one group */}
      <div className={`absolute inset-0 mix-blend-screen ${styles.bodyBack}`}>
        <div className={`absolute inset-0 ${styles.bodyFront}`}>
          <Spot id={`${id}-blue`} blur={11.74} className={styles.spotBlue}>
            {(filter) => (
              <ellipse
                cx="226.4"
                cy="173.3"
                rx="101.321"
                ry="44.167"
                filter={filter}
                className="fill-ball-spot-blue"
              />
            )}
          </Spot>
          <Spot id={`${id}-red`} blur={13.208} className={styles.spotRed}>
            {(filter) => (
              <ellipse
                cx="140.8"
                cy="399.4"
                rx="78.744"
                ry="63.97"
                transform="rotate(46.25 140.8 399.4)"
                filter={filter}
                className="fill-ball-spot-red"
              />
            )}
          </Spot>
          <Spot id={`${id}-amber`} blur={13.208} className={styles.spotAmber}>
            {(filter) => (
              <ellipse
                cx="348.2"
                cy="354.6"
                rx="94.027"
                ry="61.734"
                transform="rotate(-88.2 348.2 354.6)"
                filter={filter}
                className="fill-ball-spot-amber"
              />
            )}
          </Spot>
        </div>
      </div>

    </div>
  );

  // aria-hidden after the spread so a caller can't un-hide a decorative mark.
  // The sway class rotates the root around its top centre: the mount when
  // hanging, the top of the ball otherwise.
  if (!hang) {
    return (
      <div {...props} className={`${styles.sway} ${className}`} aria-hidden="true">
        {ball}
      </div>
    );
  }
  return (
    <div
      {...props}
      className={`grid justify-items-center ${styles.sway} ${className}`}
      aria-hidden="true"
    >
      <div className="row-[1/-2] flex w-full flex-col items-center">
        <span className="bg-surface-ink aspect-[9/4] w-[2.5%] shrink-0" />
        <span className="bg-surface-ink w-0.25 flex-1" />
      </div>
      <div className="row-[-2/-1] flex w-full flex-col items-center">
        <span className="bg-surface-ink h-(--disco-drop,0) w-0.25 shrink-0" />
        {ball}
      </div>
    </div>
  );
}

export default DiscoBall;
