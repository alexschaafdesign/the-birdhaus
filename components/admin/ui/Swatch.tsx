// A small square of status colour beside an ink label: the paper admin's way
// to keep many categories apart (submission statuses) with the
// DS spectrum, whose colours are fill-only on paper. Decorative; the label
// carries the meaning.
export function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 ${className}`} />;
}

export default Swatch;
