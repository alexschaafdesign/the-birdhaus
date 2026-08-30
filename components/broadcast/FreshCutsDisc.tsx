/* eslint-disable @next/next/no-img-element */
// The Fresh Cuts chassis swaps the disco ball for a flat yellow disc with the
// hand-drawn wordmark laid across it. The wordmark is the real vector pulled
// from Figma (public/redesign/fresh-cuts-wordmark.svg), not a script webfont.
// Rendered as a plain <img> (not next/image) because it's a static, decorative
// vector — no optimization pipeline needed.

export default function FreshCutsDisc({ tag }: { tag?: string }) {
  return (
    <div className="bx-fcdisc">
      <div className="bx-fcdisc__circle" aria-hidden="true" />
      <img
        className="bx-fcdisc__mark"
        src="/redesign/fresh-cuts-wordmark.svg"
        alt="Fresh Cuts"
      />
      <div className="bx-fcdisc__tag" aria-hidden="true">
        {tag && (
          <div style={{ fontSize: '0.8rem', color: 'var(--bx-red)', letterSpacing: '0.08em' }}>
            {tag}
          </div>
        )}
        <div style={{ fontSize: '0.72rem', color: 'var(--bx-ink)', letterSpacing: '0.12em', marginTop: 4 }}>
          SHORT SETS
          <br />
          NEW MATERIAL ONLY
        </div>
      </div>
    </div>
  );
}
