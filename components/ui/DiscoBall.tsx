import { useId, type ComponentProps } from 'react';

// Birdhaus DS primitive — birdhaus-logo-ball, "Default" variant (the Fresh Cuts
// and VHS variants come later). Not the /tv broadcast ball in
// components/broadcast — this one is the 2027 DS version.
//
// Built as in Figma: a hanging wire (text-meta), then two rims multiplied onto
// the ground — rim-blue at the back (lower left), rim-red at the front (upper
// right) — whose overlap is the dark body. Three spots are screened on top:
// spot-blue (top), spot-red (left), spot-amber (right), each blurred with
// Figma's grain (fractal noise split into a dark and a light speckle layer).
//
// Colours are fill-* token utilities. The noise floods use ink/paper rather
// than Figma's pure black/white (the DS rule: no pure black, no pure white).
// Geometry is the Figma frame's own units (477 × 565 viewBox), so the ball
// scales with its container's width. Decorative, so aria-hidden.

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

export type DiscoBallProps = Omit<ComponentProps<'svg'>, 'children' | 'viewBox'>;

export function DiscoBall({ className = '', ...props }: DiscoBallProps) {
  // useId output can carry characters that aren't valid in url(#…) refs.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const grain = `${id}-grain`;
  const grainSoft = `${id}-grain-soft`;
  return (
    <svg
      {...props}
      viewBox="0 0 477 565"
      fill="none"
      className={`block h-auto w-full ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <GrainBlur id={grain} blur={13.208} />
        <GrainBlur id={grainSoft} blur={11.74} />
      </defs>

      {/* wire */}
      <rect x="238" y="0" width="1" height="100" className="fill-text-meta" />

      {/* rims: back then front, multiplied */}
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

      {/* spots, screened */}
      <ellipse
        cx="226.4"
        cy="173.3"
        rx="101.321"
        ry="44.167"
        filter={`url(#${grainSoft})`}
        className="fill-ball-spot-blue mix-blend-screen"
      />
      <ellipse
        cx="140.8"
        cy="399.4"
        rx="78.744"
        ry="63.97"
        transform="rotate(46.25 140.8 399.4)"
        filter={`url(#${grain})`}
        className="fill-ball-spot-red mix-blend-screen"
      />
      <ellipse
        cx="348.2"
        cy="354.6"
        rx="94.027"
        ry="61.734"
        transform="rotate(-88.2 348.2 354.6)"
        filter={`url(#${grain})`}
        className="fill-ball-spot-amber mix-blend-screen"
      />
    </svg>
  );
}

export default DiscoBall;
