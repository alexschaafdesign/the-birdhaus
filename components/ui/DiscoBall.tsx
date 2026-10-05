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
// Glints: four specular flashes (core + halo + needle rays, plus-lighter) at
// points where light would catch, ~one every 10s on irregular cycles; inside
// the sway group, and riding the scroll-turn with their spot or rim.

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

// Glints: specular flashes (timing in DiscoBall.module.css). Each is light,
// not a sticker: a pinpoint core, a soft halo (a static radial gradient — the
// softness is drawn once, never a filter) and needle rays, the horizontal one
// longest, all surface-paper and blended plus-lighter so it brightens
// whatever it lands on. Sizes vary (% of the ball's width; the biggest is on
// the longest cycle, so it's the rarest).
//
// Placement follows the light: the amber and blue glints sit on their spots'
// highlight edges and ride the spot's scroll drift; the two rim glints sit
// where the blue crescent meets the body (132° and 155° on the front rim) on a
// layer that turns about that rim, so they slide along its edge. Positions are
// % of the ball box, from the Figma geometry. The outer span's translate
// centres the glint on its point; the inner span carries the flash animation.
type GlintSpec = { at: string; size: string; flash: string };

const RIM_GLINTS: GlintSpec[] = [
  { at: 'left-[20.63%] top-[12.53%]', size: 'w-[3.6%]', flash: styles.glintRimA },
  { at: 'left-[9.36%] top-[28.09%]', size: 'w-[2.8%]', flash: styles.glintRimB },
];
const AMBER_GLINT: GlintSpec = {
  at: 'left-[63.77%] top-[41.24%]',
  size: 'w-[4.4%]',
  flash: styles.glintAmber,
};
const BLUE_GLINT: GlintSpec = {
  at: 'left-[59.75%] top-[7.92%]',
  size: 'w-[6%]',
  flash: styles.glintBlue,
};

function Glint({ at, size, flash }: GlintSpec) {
  return (
    <span className={`absolute aspect-square -translate-1/2 ${size} ${at}`}>
      <span className={`absolute inset-0 ${styles.glint} ${flash}`}>
        <span className="absolute inset-[30%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-surface-paper)_75%,transparent),transparent)]" />
        <svg
          viewBox="-50 -50 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M-50 0L0 -1.6L50 0L0 1.6Z" className="fill-surface-paper" />
          <path d="M0 -34L1.2 0L0 34L-1.2 0Z" className="fill-surface-paper" />
          <circle r="4" className="fill-surface-paper" />
        </svg>
      </span>
    </span>
  );
}

// A full-ball layer for glints that ride a motion (a spot's drift, the rim
// turn); its class supplies the scroll animation. The plus-lighter blend sits
// on the layer: a transformed layer is its own compositing group, so a blend
// on the glint inside it would only meet the empty layer.
function GlintLayer({ motion, glints }: { motion: string; glints: GlintSpec[] }) {
  return (
    <div className={`pointer-events-none absolute inset-0 mix-blend-plus-lighter ${motion}`}>
      {glints.map((g) => (
        <Glint key={g.flash} {...g} />
      ))}
    </div>
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

      <GlintLayer motion={styles.rimTurn} glints={RIM_GLINTS} />
      <GlintLayer motion={styles.spotAmber} glints={[AMBER_GLINT]} />
      <GlintLayer motion={styles.spotBlue} glints={[BLUE_GLINT]} />
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
