// Decorative texture primitives for the broadcast homepage. All are aria-hidden
// — they carry no meaning, just the VHS surface. Kept cheap on purpose:
// scanlines are one CSS gradient, washes are three blurred divs, and the
// tracking-noise band is a single stretched SVG (not the ~95 rects the print
// build uses).

export function Scanlines() {
  return <div className="bx-scanlines" aria-hidden="true" />;
}

export function Washes() {
  return (
    <div className="bx-washes" aria-hidden="true">
      <div className="bx-wash bx-wash--blue" />
      <div className="bx-wash bx-wash--red" />
      <div className="bx-wash bx-wash--green" />
    </div>
  );
}

export function RegistrationMarks() {
  return (
    <div aria-hidden="true">
      <span className="bx-regmark bx-regmark--tl" />
      <span className="bx-regmark bx-regmark--tr" />
      <span className="bx-regmark bx-regmark--bl" />
      <span className="bx-regmark bx-regmark--br" />
    </div>
  );
}

// VHS head-switching artifact along an edge: a fixed handful of irregular gray
// blocks plus three thin R/G/B slivers, drawn once as a stretched SVG. The block
// coordinates mirror the Figma noise band (16 blocks) rather than emitting a DOM
// node per rectangle.
const NOISE_BLOCKS: Array<[number, number, number, number, number]> = [
  // [x, y, w, h, opacity]
  [0, 17, 14, 14, 0.47],
  [50, 2, 68, 4, 0.55],
  [143, 4, 15, 4, 0.54],
  [176, 18, 57, 17, 0.6],
  [268, 12, 78, 5, 0.52],
  [360, 14, 63, 17, 0.47],
  [437, 14, 36, 12, 0.53],
  [511, 13, 58, 10, 0.41],
  [576, 6, 20, 14, 0.31],
  [604, 21, 27, 15, 0.56],
  [653, 13, 40, 14, 0.38],
  [698, 27, 63, 8, 0.52],
  [787, 7, 38, 16, 0.51],
  [863, 25, 79, 10, 0.67],
  [966, 13, 29, 6, 0.69],
  [1012, 21, 67, 5, 0.65],
];

export function TrackingNoise({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1080 44"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {NOISE_BLOCKS.map(([x, y, w, h, o], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#4d4d4d" opacity={o} />
      ))}
      {/* R/G/B slivers, multiply-blended like the tape's chroma tear. */}
      <rect x={0} y={0} width={1080} height={3} fill="var(--bx-sliver-blue)" opacity={0.5} style={{ mixBlendMode: 'multiply' }} />
      <rect x={0} y={20} width={1080} height={3} fill="var(--bx-chroma-m)" opacity={0.5} style={{ mixBlendMode: 'multiply' }} />
      <rect x={0} y={40} width={1080} height={3} fill="var(--bx-chroma-y)" opacity={0.5} style={{ mixBlendMode: 'multiply' }} />
    </svg>
  );
}
