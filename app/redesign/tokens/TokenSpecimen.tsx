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
//   against the `--bh-size-*` raw var resolved to px through a probe element
//   (on :root it's a fluid clamp(), so its string isn't a px value); a broken
//   utility inherits a different size -> FAIL. That comparison is also what
//   makes the live [data-context] switch and the fluid resize observable.
// - The type face is checked through document.fonts: each self-hosted
//   CommitMono weight must load from its @font-face, else FAIL.

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
// by Figma family: surface, line, text, accent, tape, ball, spectrum, series
// aliases; then the 7 bars. legacy/* is not emitted, so it isn't shown.
type Swatch = { token: string; bg: string; alias?: string };

const SOLID_GROUPS: { label: string; swatches: Swatch[] }[] = [
  {
    label: 'surface',
    swatches: [
      { token: 'surface-paper', bg: 'bg-surface-paper' },
      { token: 'surface-ink', bg: 'bg-surface-ink' },
      { token: 'surface-paper-shade', bg: 'bg-surface-paper-shade' },
      { token: 'surface-ink-raised', bg: 'bg-surface-ink-raised' },
    ],
  },
  { label: 'line', swatches: [{ token: 'line-ink', bg: 'bg-line-ink' }] },
  {
    label: 'text',
    swatches: [
      { token: 'text-primary', bg: 'bg-text-primary' },
      { token: 'text-inverse', bg: 'bg-text-inverse' },
      { token: 'text-secondary', bg: 'bg-text-secondary' },
      { token: 'text-muted', bg: 'bg-text-muted' },
      { token: 'text-meta', bg: 'bg-text-meta' },
    ],
  },
  {
    label: 'accent',
    swatches: [
      { token: 'accent-red', bg: 'bg-accent-red' },
      { token: 'accent-brick', bg: 'bg-accent-brick' },
    ],
  },
  {
    label: 'tape',
    swatches: [
      { token: 'tape-phosphor', bg: 'bg-tape-phosphor' },
      { token: 'tape-tally', bg: 'bg-tape-tally' },
    ],
  },
  {
    label: 'ball',
    swatches: [
      { token: 'ball-rim-red', bg: 'bg-ball-rim-red' },
      { token: 'ball-rim-blue', bg: 'bg-ball-rim-blue' },
      { token: 'ball-spot-amber', bg: 'bg-ball-spot-amber', alias: 'spectrum-amber' },
      { token: 'ball-spot-red', bg: 'bg-ball-spot-red' },
      { token: 'ball-spot-blue', bg: 'bg-ball-spot-blue' },
    ],
  },
  {
    label: 'spectrum',
    swatches: [
      { token: 'spectrum-violet', bg: 'bg-spectrum-violet' },
      { token: 'spectrum-magenta', bg: 'bg-spectrum-magenta' },
      { token: 'spectrum-red', bg: 'bg-spectrum-red' },
      { token: 'spectrum-orange', bg: 'bg-spectrum-orange' },
      { token: 'spectrum-amber', bg: 'bg-spectrum-amber' },
    ],
  },
  // Aliases sit in @theme inline, so --color-series-* is NOT a :root custom
  // property — the reading checks the alias TARGET's var instead.
  {
    label: 'series (aliases)',
    swatches: [
      { token: 'series-bh', bg: 'bg-series-bh', alias: 'text-muted' },
      { token: 'series-fc', bg: 'bg-series-fc', alias: 'spectrum-amber' },
      { token: 'series-video', bg: 'bg-series-video', alias: 'spectrum-violet' },
      { token: 'series-tape', bg: 'bg-series-tape', alias: 'spectrum-orange' },
      { token: 'series-song-club', bg: 'bg-series-song-club', alias: 'spectrum-magenta' },
    ],
  },
];

// Bars are aliases too (ink, the five spectrum colors, paper), in band order.
// bars-7-paper is invisible on the paper ground — the strip's border shows it.
const BARS: Swatch[] = [
  { token: 'bars-1-ink', bg: 'bg-bars-1-ink', alias: 'surface-ink' },
  { token: 'bars-2-violet', bg: 'bg-bars-2-violet', alias: 'spectrum-violet' },
  { token: 'bars-3-magenta', bg: 'bg-bars-3-magenta', alias: 'spectrum-magenta' },
  { token: 'bars-4-red', bg: 'bg-bars-4-red', alias: 'spectrum-red' },
  { token: 'bars-5-orange', bg: 'bg-bars-5-orange', alias: 'spectrum-orange' },
  { token: 'bars-6-amber', bg: 'bg-bars-6-amber', alias: 'spectrum-amber' },
  { token: 'bars-7-paper', bg: 'bg-bars-7-paper', alias: 'surface-paper' },
];

const COLOR_TOTAL =
  SOLID_GROUPS.reduce((n, g) => n + g.swatches.length, 0) + BARS.length; // 36

// The self-hosted weights (app/redesign/commit-mono.css) — the only two the
// Figma text styles use. Literal classes for the scanner.
const FACES: { weight: string; label: string; cls: string }[] = [
  { weight: '400', label: 'Regular', cls: 'font-normal' },
  { weight: '700', label: 'Bold', cls: 'font-bold' },
];

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

function ColorMeta({
  token,
  alias,
  reading,
}: {
  token: string;
  alias?: string;
  reading?: Reading;
}) {
  return (
    <div className="mt-1 text-xs leading-tight">
      <div className="text-surface-ink">{token}</div>
      {alias && <div className="text-surface-ink/60">→ {alias}</div>}
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
  const [faceReadings, setFaceReadings] = useState<Record<string, Reading>>({});

  const mainRef = useRef<HTMLElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  // Type face: take the family from the computed font-family (so a broken
  // --font-commit-mono surfaces here), then ask document.fonts to load each
  // self-hosted weight. Only a face that actually loaded from our @font-face
  // passes — a 404'd file or a fallback monospace is a FAIL.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const family = getComputedStyle(main).fontFamily.split(',')[0].trim().replace(/^"|"$/g, '');
    let cancelled = false;
    Promise.all(
      FACES.map(async (f) => {
        try {
          const loaded = await document.fonts.load(`${f.weight} 1em "${family}"`);
          const ok = loaded.some((face) => face.status === 'loaded');
          return [f.weight, { value: `${family} ${f.weight}`, ok }] as const;
        } catch {
          return [f.weight, { value: `${family} ${f.weight}`, ok: false }] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setFaceReadings(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const varToken = el.getAttribute('data-color-alias') || token;
      const cssVar = cs.getPropertyValue('--color-' + varToken).trim();
      next[token] = { value: bg, ok: cssVar !== '' && !TRANSPARENT.has(bg) };
    });
    setColorReadings(next);
  }, []);

  // Web sizes are fluid, so re-read on resize as well as on context change.
  const [viewportTick, setViewportTick] = useState(0);
  useEffect(() => {
    const onResize = () => setViewportTick((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sizes re-resolve when the context or viewport changes. Compare the applied
  // font-size to the --bh-size-* raw var resolved to px by a probe span in the
  // same context, so a broken utility (which would inherit) is caught and the
  // live TV/print/etc. switch and fluid scaling are provably reflected.
  useEffect(() => {
    const root = typeRef.current;
    if (!root) return;
    const next: Record<string, Reading> = {};
    root.querySelectorAll<HTMLElement>('[data-size-token]').forEach((el) => {
      const token = el.getAttribute('data-size-token');
      if (!token) return;
      const cs = getComputedStyle(el);
      const applied = cs.fontSize;
      const raw = cs.getPropertyValue('--bh-size-' + token).trim();
      const probe = document.createElement('span');
      probe.style.fontSize = `var(--bh-size-${token})`;
      el.appendChild(probe);
      const expected = getComputedStyle(probe).fontSize;
      probe.remove();
      next[token] = { value: applied, ok: raw !== '' && applied === expected };
    });
    setSizeReadings(next);
  }, [context, viewportTick]);

  const colorOk = Object.values(colorReadings).filter((r) => r.ok).length;
  const sizeOk = Object.values(sizeReadings).filter((r) => r.ok).length;
  const faceOk = Object.values(faceReadings).filter((r) => r.ok).length;
  const activeCtx = CONTEXTS.find((c) => c.id === context);

  return (
    <main
      ref={mainRef}
      className="bg-surface-paper text-surface-ink font-commit-mono min-h-screen px-6 py-10"
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
            <span className="text-surface-ink/40"> · </span>
            <span className={faceOk === FACES.length ? 'text-surface-ink' : 'text-accent-red'}>
              faces {faceOk}/{FACES.length}
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
                        data-color-alias={s.alias}
                      />
                      <ColorMeta
                        token={s.token}
                        alias={s.alias}
                        reading={colorReadings[s.token]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Bars — contiguous strip in band order */}
            <div>
              <div className="text-data-overline-11 text-surface-ink/50 mb-2 uppercase">
                bars <span className="normal-case">(band order 1–7)</span>
              </div>
              <div className="border-surface-ink/20 flex h-16 border">
                {BARS.map((b) => (
                  <div
                    key={b.token}
                    className={`flex-1 ${b.bg}`}
                    data-color-token={b.token}
                    data-color-alias={b.alias}
                  />
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

        {/* ---- TYPE FACE ---------------------------------------------- */}
        <section className="mb-14">
          <h2 className="text-header-3 mb-2">Type face</h2>
          <p className="text-body-3 text-surface-ink/70 mb-4 max-w-prose">
            <span className="text-surface-ink">font-commit-mono</span> — self-hosted CommitMono,
            the two weights the Figma text styles use. Each passes only if{' '}
            <span className="text-surface-ink">document.fonts</span> loaded our @font-face file.
          </p>
          <div className="flex flex-col">
            {FACES.map((f) => (
              <div
                key={f.weight}
                className="border-surface-ink/10 flex items-baseline gap-4 border-b py-2"
              >
                <div className="w-56 shrink-0 text-xs leading-tight">
                  <div className="text-surface-ink">
                    {f.label} {f.weight}
                  </div>
                  <div className="text-surface-ink/60">
                    <ReadOut reading={faceReadings[f.weight]} />
                  </div>
                </div>
                <div className={`text-header-3 min-w-0 flex-1 truncate ${f.cls}`}>
                  {SPECIMEN} · 0O 1lI {'{}'} =&gt; !=
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- TYPE SCALE --------------------------------------------- */}
        <section>
          <h2 className="text-header-3 mb-2">Type scale</h2>
          <p className="text-body-3 text-surface-ink/70 mb-4 max-w-prose">
            Each line is CommitMono at a <span className="text-surface-ink">--text-*</span>{' '}
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
