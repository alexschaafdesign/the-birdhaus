'use client';

// Token specimen — validates the GENERATED tokens.css, not the Figma file.
// Every value shown is read live from the browser with getComputedStyle after
// the @theme build resolves. Nothing here imports tokens.figma.json or hardcodes
// a hex/px value; a broken token surfaces as a visible FAIL, never a blank.
//
// - Colors sit in plain @theme, so `bg-<token>` applies a real color. A broken
//   token leaves the swatch transparent -> FAIL.
// - Sizes sit in @theme inline, so `--text-*` is NOT a :root custom property
//   (it's inlined into the utility). We instead compare the applied font-size
//   against the resolved `--bh-size-*` raw var; a broken utility inherits a
//   different size -> FAIL. That comparison is also what makes the live
//   [data-context] re-resolve observable.

import { useEffect, useRef, useState } from 'react';

type Reading = { value: string; ok: boolean };
type Ctx = 'web' | 'print' | 'social' | 'tv' | 'mobile';

const CONTEXTS: { id: Ctx; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'print', label: 'Print 200dpi' },
  { id: 'social', label: 'Social 1080' },
  { id: 'tv', label: 'TV 720×480' },
  { id: 'mobile', label: 'Mobile 390' },
];

// Literal class strings so Tailwind's scanner generates each utility. Grouped
// per the spec: surface, text, accent, wash, series, chroma, then the 7 bars.
const SOLID_GROUPS: { label: string; swatches: { token: string; bg: string }[] }[] = [
  {
    label: 'surface',
    swatches: [
      { token: 'surface-paper', bg: 'bg-surface-paper' },
      { token: 'surface-ink', bg: 'bg-surface-ink' },
    ],
  },
  {
    label: 'text',
    swatches: [
      { token: 'text-primary', bg: 'bg-text-primary' },
      { token: 'text-inverse', bg: 'bg-text-inverse' },
    ],
  },
  { label: 'accent', swatches: [{ token: 'accent-red', bg: 'bg-accent-red' }] },
  { label: 'series', swatches: [{ token: 'series-fresh-cuts', bg: 'bg-series-fresh-cuts' }] },
  {
    label: 'chroma',
    swatches: [
      { token: 'chroma-yellow', bg: 'bg-chroma-yellow' },
      { token: 'chroma-magenta', bg: 'bg-chroma-magenta' },
    ],
  },
];

// Washes carry alpha — shown over both surface-ink and surface-paper so the
// translucency is actually visible.
const WASHES: { token: string; bg: string }[] = [
  { token: 'wash-blue', bg: 'bg-wash-blue' },
  { token: 'wash-red', bg: 'bg-wash-red' },
  { token: 'wash-green', bg: 'bg-wash-green' },
];

// Canonical SMPTE order: gray, yellow, cyan, green, magenta, red, blue.
const BARS: { token: string; bg: string }[] = [
  { token: 'bars-1-gray', bg: 'bg-bars-1-gray' },
  { token: 'bars-2-yellow', bg: 'bg-bars-2-yellow' },
  { token: 'bars-3-cyan', bg: 'bg-bars-3-cyan' },
  { token: 'bars-4-green', bg: 'bg-bars-4-green' },
  { token: 'bars-5-magenta', bg: 'bg-bars-5-magenta' },
  { token: 'bars-6-red', bg: 'bg-bars-6-red' },
  { token: 'bars-7-blue', bg: 'bg-bars-7-blue' },
];

const COLOR_TOTAL =
  SOLID_GROUPS.reduce((n, g) => n + g.swatches.length, 0) + WASHES.length + BARS.length; // 18

// All 28 --text-* utilities, literal class strings for the scanner.
const SIZES: { token: string; cls: string }[] = [
  { token: 'display-1', cls: 'text-display-1' },
  { token: 'display-2', cls: 'text-display-2' },
  { token: 'display-3', cls: 'text-display-3' },
  { token: 'display-4', cls: 'text-display-4' },
  { token: 'header-1', cls: 'text-header-1' },
  { token: 'header-2', cls: 'text-header-2' },
  { token: 'header-3', cls: 'text-header-3' },
  { token: 'header-4', cls: 'text-header-4' },
  { token: 'body-1', cls: 'text-body-1' },
  { token: 'body-2', cls: 'text-body-2' },
  { token: 'body-3', cls: 'text-body-3' },
  { token: 'timecode', cls: 'text-timecode' },
  { token: 'data-set-time-20', cls: 'text-data-set-time-20' },
  { token: 'data-catalogue-id-16', cls: 'text-data-catalogue-id-16' },
  { token: 'data-caption-13', cls: 'text-data-caption-13' },
  { token: 'data-caption-13-bold', cls: 'text-data-caption-13-bold' },
  { token: 'data-label-11', cls: 'text-data-label-11' },
  { token: 'data-label-10-small', cls: 'text-data-label-10-small' },
  { token: 'data-overline-11', cls: 'text-data-overline-11' },
  { token: 'data-spec-12', cls: 'text-data-spec-12' },
  { token: 'ui-input-label-12', cls: 'text-ui-input-label-12' },
  { token: 'ui-input-value-16', cls: 'text-ui-input-value-16' },
  { token: 'ui-nav-item-14', cls: 'text-ui-nav-item-14' },
  { token: 'ui-button-15', cls: 'text-ui-button-15' },
  { token: 'ui-link-16', cls: 'text-ui-link-16' },
  { token: 'tv-heading-34', cls: 'text-tv-heading-34' },
  { token: 'tv-label-20', cls: 'text-tv-label-20' },
  { token: 'tv-body-22', cls: 'text-tv-body-22' },
];

const SPECIMEN = 'Birdhaus 0123 — signal';

const TRANSPARENT = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)']);

function ReadOut({ reading }: { reading?: Reading }) {
  if (!reading) return <span className="text-surface-ink/40">reading…</span>;
  if (!reading.ok) {
    return (
      <span className="bg-accent-red text-surface-paper px-1">
        FAIL{reading.value ? ` · ${reading.value}` : ''}
      </span>
    );
  }
  return <span>{reading.value}</span>;
}

function ColorMeta({ token, reading }: { token: string; reading?: Reading }) {
  return (
    <div className="mt-1 text-xs leading-tight">
      <div className="text-surface-ink">{token}</div>
      <div className="text-surface-ink/60">
        <ReadOut reading={reading} />
      </div>
    </div>
  );
}

export default function TokenSpecimen() {
  const [context, setContext] = useState<Ctx>('web');
  const [colorReadings, setColorReadings] = useState<Record<string, Reading>>({});
  const [sizeReadings, setSizeReadings] = useState<Record<string, Reading>>({});

  const colorRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  // Colors are context-independent: read once after mount.
  useEffect(() => {
    const root = colorRef.current;
    if (!root) return;
    const next: Record<string, Reading> = {};
    root.querySelectorAll<HTMLElement>('[data-color-token]').forEach((el) => {
      const token = el.getAttribute('data-color-token');
      if (!token) return;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const cssVar = cs.getPropertyValue('--color-' + token).trim();
      next[token] = { value: bg, ok: cssVar !== '' && !TRANSPARENT.has(bg) };
    });
    setColorReadings(next);
  }, []);

  // Sizes re-resolve when the context changes. Compare the applied font-size to
  // the resolved --bh-size-* raw var so a broken utility (which would inherit)
  // is caught, and so the live TV/print/etc. switch is provably reflected.
  useEffect(() => {
    const root = typeRef.current;
    if (!root) return;
    const next: Record<string, Reading> = {};
    root.querySelectorAll<HTMLElement>('[data-size-token]').forEach((el) => {
      const token = el.getAttribute('data-size-token');
      if (!token) return;
      const cs = getComputedStyle(el);
      const applied = cs.fontSize;
      const expected = cs.getPropertyValue('--bh-size-' + token).trim();
      next[token] = { value: applied, ok: expected !== '' && applied === expected };
    });
    setSizeReadings(next);
  }, [context]);

  const colorOk = Object.values(colorReadings).filter((r) => r.ok).length;
  const sizeOk = Object.values(sizeReadings).filter((r) => r.ok).length;
  const activeCtx = CONTEXTS.find((c) => c.id === context);

  return (
    <main
      className="bg-surface-paper text-surface-ink font-berkeley min-h-screen px-6 py-10"
      style={{ WebkitTextStroke: 0 }}
    >
      <div className="mx-auto max-w-5xl">
        {/* Header + live status */}
        <header className="border-surface-ink/20 mb-10 border-b pb-6">
          <h1 className="text-header-2">Token specimen · /redesign/tokens</h1>
          <p className="text-body-3 text-surface-ink/70 mt-2 max-w-prose">
            Every value below is read from the browser with{' '}
            <span className="text-surface-ink">getComputedStyle</span> after the
            Tailwind <span className="text-surface-ink">@theme</span> build resolves —
            it validates the generated tokens.css, not Figma. A token that doesn&apos;t
            resolve shows <span className="bg-accent-red text-surface-paper px-1">FAIL</span>,
            not a blank.
          </p>
          <p className="text-data-spec-12 mt-3">
            <span
              className={colorOk === COLOR_TOTAL ? 'text-surface-ink' : 'text-accent-red'}
            >
              colors {colorOk}/{COLOR_TOTAL}
            </span>
            <span className="text-surface-ink/40"> · </span>
            <span className={sizeOk === SIZES.length ? 'text-surface-ink' : 'text-accent-red'}>
              sizes {sizeOk}/{SIZES.length}
            </span>
          </p>
        </header>

        {/* ---- COLORS -------------------------------------------------- */}
        <section ref={colorRef} className="mb-14">
          <h2 className="text-header-3 mb-5">Colors</h2>

          <div className="flex flex-col gap-8">
            {SOLID_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-data-overline-11 text-surface-ink/50 mb-2 uppercase">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {group.swatches.map((s) => (
                    <div key={s.token}>
                      <div
                        className={`border-surface-ink/20 h-16 border ${s.bg}`}
                        data-color-token={s.token}
                      />
                      <ColorMeta token={s.token} reading={colorReadings[s.token]} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* washes over ink + paper */}
            <div>
              <div className="text-data-overline-11 text-surface-ink/50 mb-2 uppercase">
                wash <span className="normal-case">(over surface-ink · surface-paper)</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {WASHES.map((w) => (
                  <div key={w.token}>
                    <div className="border-surface-ink/20 relative flex h-16 border">
                      <div className="bg-surface-ink flex-1" />
                      <div className="bg-surface-paper flex-1" />
                      <div className={`absolute inset-0 ${w.bg}`} data-color-token={w.token} />
                    </div>
                    <ColorMeta token={w.token} reading={colorReadings[w.token]} />
                  </div>
                ))}
              </div>
            </div>

            {/* SMPTE bars — contiguous strip in canonical order */}
            <div>
              <div className="text-data-overline-11 text-surface-ink/50 mb-2 uppercase">
                bars <span className="normal-case">(SMPTE, canonical order)</span>
              </div>
              <div className="border-surface-ink/20 flex h-16 border">
                {BARS.map((b) => (
                  <div key={b.token} className={`flex-1 ${b.bg}`} data-color-token={b.token} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1 sm:grid-cols-7">
                {BARS.map((b) => (
                  <div key={b.token} className="text-xs leading-tight">
                    <div className="text-surface-ink truncate">{b.token}</div>
                    <div className="text-surface-ink/60">
                      <ReadOut reading={colorReadings[b.token]} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- TYPE SCALE --------------------------------------------- */}
        <section>
          <h2 className="text-header-3 mb-2">Type scale</h2>
          <p className="text-body-3 text-surface-ink/70 mb-4 max-w-prose">
            Each line is Berkeley Mono at a <span className="text-surface-ink">--text-*</span>{' '}
            utility. Switch context to re-resolve the whole scale live — the resolved px
            beside each token updates in place. Current:{' '}
            <span className="text-surface-ink">{activeCtx?.label}</span>.
          </p>

          <div role="group" aria-label="Type scale context" className="mb-2 flex flex-wrap gap-2">
            {CONTEXTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContext(c.id)}
                aria-pressed={context === c.id}
                className={`text-ui-button-15 border-surface-ink border px-3 py-1 ${
                  context === c.id
                    ? 'bg-surface-ink text-surface-paper'
                    : 'bg-surface-paper text-surface-ink'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <p className="text-data-spec-12 text-surface-ink/50 mb-6 max-w-prose">
            TV values target a 720×480 interlaced composite CRT with real overscan — this
            desktop preview is an approximation, not a verification. No safe-area or overscan
            compensation is applied here; that belongs on the real /tv page.
          </p>

          <div ref={typeRef} data-context={context}>
            {SIZES.map((s) => (
              <div
                key={s.token}
                className="border-surface-ink/10 flex items-baseline gap-4 border-b py-2"
              >
                <div className="w-56 shrink-0 text-xs leading-tight">
                  <div className="text-surface-ink">{s.token}</div>
                  <div className="text-surface-ink/60">
                    <ReadOut reading={sizeReadings[s.token]} />
                  </div>
                </div>
                <div
                  className={`min-w-0 flex-1 overflow-hidden leading-none whitespace-nowrap ${s.cls}`}
                  data-size-token={s.token}
                >
                  {SPECIMEN}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
