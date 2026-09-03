'use client';

// Preview for the DS primitives (Button, NavLink), rendered from components/ui
// and styled only with --color-* / --text-* tokens. Same posture as the tokens
// specimen: noindex, and a [data-context] switcher so the components' type
// re-resolves live (web/print/social/tv/mobile) — a way to see the TV sizing
// before /tv is written. Separate route, deliberately not folded into /tokens.

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { NavLink } from '@/components/ui/NavLink';

type Ctx = 'web' | 'print' | 'social' | 'tv' | 'mobile';

const CONTEXTS: { id: Ctx; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'print', label: 'Print 200dpi' },
  { id: 'social', label: 'Social 1080' },
  { id: 'tv', label: 'TV 720×480' },
  { id: 'mobile', label: 'Mobile 390' },
];

export default function ComponentGallery() {
  const [context, setContext] = useState<Ctx>('web');
  const active = CONTEXTS.find((c) => c.id === context);

  return (
    <main
      className="bg-surface-paper text-surface-ink font-berkeley min-h-screen px-6 py-10"
      style={{ WebkitTextStroke: 0 }}
    >
      <div className="mx-auto max-w-5xl">
        <header className="border-surface-ink/20 mb-8 border-b pb-6">
          <h1 className="text-header-2">Component preview · /redesign/components</h1>
          <p className="text-body-3 text-surface-ink/70 mt-2 max-w-prose">
            DS primitives from <span className="text-surface-ink">components/ui</span>, styled
            only with <span className="text-surface-ink">--color-*</span> /{' '}
            <span className="text-surface-ink">--text-*</span> tokens — no library, no hardcoded
            values. Switch context to watch their type re-resolve live. Current:{' '}
            <span className="text-surface-ink">{active?.label}</span>.
          </p>
        </header>

        <div role="group" aria-label="Preview context" className="mb-2 flex flex-wrap gap-2">
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
        <p className="text-data-spec-12 text-surface-ink/50 mb-8 max-w-prose">
          TV values target a 720×480 interlaced composite CRT with overscan — this desktop
          preview approximates, it doesn&apos;t verify. No overscan compensation here; that
          belongs on the real /tv page.
        </p>

        {/* Everything below re-resolves its --text-* under the chosen context. */}
        <div data-context={context} className="flex flex-col gap-12">
          {/* ---- Button ---------------------------------------------- */}
          <section>
            <h2 className="text-header-3 mb-1">Button</h2>
            <p className="text-data-caption-13 text-surface-ink/60 mb-4">
              variant: solid · accent · outline — square corners, Berkeley Mono, text-ui-button-15
            </p>

            <div className="text-data-overline-11 text-surface-ink/50 mb-2 uppercase">
              on surface-paper
            </div>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <Button>Solid</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="outline">Outline</Button>
              <Button disabled>Disabled</Button>
            </div>

            <div className="text-data-overline-11 text-surface-ink/50 mb-2 uppercase">
              on surface-ink
            </div>
            <div className="bg-surface-ink flex flex-wrap items-center gap-4 p-6">
              <Button>Solid</Button>
              <Button variant="accent">Accent</Button>
            </div>
          </section>

          {/* ---- Nav Link -------------------------------------------- */}
          <section>
            <h2 className="text-header-3 mb-1">Nav Link</h2>
            <p className="text-data-caption-13 text-surface-ink/60 mb-4">
              active marks the current page (text-accent-red + aria-current); text-ui-nav-item-14
            </p>
            <nav aria-label="Preview navigation" className="flex flex-wrap gap-6">
              <NavLink href="/redesign">Upcoming</NavLink>
              <NavLink href="/redesign" active>
                Archive
              </NavLink>
              <NavLink href="/redesign">Fresh Cuts</NavLink>
              <NavLink href="/redesign">Contact</NavLink>
            </nav>
          </section>
        </div>
      </div>
    </main>
  );
}
