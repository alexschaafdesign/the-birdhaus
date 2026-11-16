import type { ReactNode } from 'react';

// Status in the 2027 admin, without colours the DS doesn't have (no greens or
// status tokens in Figma as of 2026-11-15):
//   ok         ink, with a ✓
//   attention  ink on a spectrum-amber fill (amber is fill-only on paper)
//   problem    accent-red, with a ■
//   neutral    ink at 60%, for "upcoming", "draft", "—"
// The glyphs carry the meaning as well as the colour, so it reads in
// greyscale and on a printout. They're aria-hidden; the label is the text.
export type StatusTone = 'ok' | 'attention' | 'problem' | 'neutral';

const BASE = 'text-data-overline-11 inline-flex items-center gap-1 font-bold leading-[1.3] tracking-[--spacing(0.25)] uppercase whitespace-nowrap';

const TONES: Record<StatusTone, string> = {
  ok: 'text-surface-ink',
  attention: 'bg-spectrum-amber text-surface-ink px-1.5 py-0.5',
  problem: 'text-accent-red',
  neutral: 'text-surface-ink/60',
};

const GLYPHS: Partial<Record<StatusTone, string>> = { ok: '✓', problem: '■' };

export function StatusMark({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const glyph = GLYPHS[tone];
  return (
    <span className={`${BASE} ${TONES[tone]}`}>
      {glyph && <span aria-hidden>{glyph}</span>}
      {children}
    </span>
  );
}

export default StatusMark;
