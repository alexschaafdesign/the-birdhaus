// SMPTE 75% color bars, left to right. Full content width, ~22px tall (shrinks
// to 14px under 600px but never disappears). Seven flat divs — no gradients.

const BARS = ['#bfbfbf', '#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf'];

export default function SmpteBar({ className }: { className?: string }) {
  return (
    <div className={`bx-smpte ${className ?? ''}`} aria-hidden="true">
      {BARS.map((c) => (
        <span key={c} style={{ background: c }} />
      ))}
    </div>
  );
}
