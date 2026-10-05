'use client';

// Preview for the DS primitives (Button, NavLink, SeriesTick, RailHeader), rendered from components/ui
// and styled only with --color-* / --text-* tokens. Same posture as the tokens
// specimen: noindex, and a [data-context] switcher so the components' type
// re-resolves live (web/print/social/tv/mobile) — a way to see the TV sizing
// before /tv is written. Separate route, deliberately not folded into /tokens.

import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { NavLink } from '@/components/ui/NavLink';
import { SeriesTick, type Series } from '@/components/ui/SeriesTick';
import { CloseIcon, MobileMenuPanel, RailHeader } from '@/components/ui/RailHeader';
import { activeRailItem } from '@/components/ui/RailNav';
import { NAV, TAGLINE } from '../home/nav';

type Ctx = 'web' | 'print' | 'social' | 'tv' | 'mobile';

const CONTEXTS: { id: Ctx; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'print', label: 'Print 200dpi' },
  { id: 'social', label: 'Social 1080' },
  { id: 'tv', label: 'TV 720×480' },
  { id: 'mobile', label: 'Mobile 390' },
];

// Sample catalogue IDs, one per series — preview copy, not real catalogue data.
const SERIES_SAMPLES: { series: Series; id: string }[] = [
  { series: 'bh', id: 'BH-0142' },
  { series: 'fc', id: 'FC-018' },
  { series: 'video', id: 'BHV-031' },
  { series: 'tape', id: 'BHR-007' },
  { series: 'song-club', id: 'SC-012' },
];

// Every Figma Button combination: 3 variants × 2 sizes × 4 states = 24.
const BUTTON_VARIANTS: NonNullable<ButtonProps['variant']>[] = ['primary', 'secondary', 'ghost'];
const BUTTON_SIZES: NonNullable<ButtonProps['size']>[] = ['m', 's'];
const BUTTON_STATES = ['default', 'hover', 'pressed', 'disabled'] as const;

// Mobile menu open state per route, and the counts shown in its footer
// (preview copy, the mockup's numbers).
const MENU_ROUTES = ['/redesign/home', '/archive', '/contact', '/tv'] as const;
const SAMPLE_STATS = { bands: 98, sets: 134 };

// Rail header active state per route (pathname override): one per nav item,
// plus routes that claim no item.
const RAIL_ROUTES = [
  '/redesign/home',
  '/shows/some-show',
  '/archive',
  '/photos/someone',
  '/contact',
  '/song-club',
  '/tv',
] as const;

export default function ComponentGallery() {
  const [context, setContext] = useState<Ctx>('web');
  const active = CONTEXTS.find((c) => c.id === context);

  return (
    <main
      className="bg-surface-paper text-surface-ink font-commit-mono min-h-screen px-6 py-10"
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
              variant: primary · secondary · ghost — size: m · s — states are CSS (hover,
              pressed, disabled), forced here via data-preview-state
            </p>

            {/* TODO: buttons on surface-ink. Figma defines no ink variant (the
                color collection is Light-only), so there's no ink panel until
                a page needs one and it's designed — don't invent an inversion. */}
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-x-6 border-spacing-y-4">
                <thead>
                  <tr className="text-data-overline-11 text-surface-ink/50 text-left uppercase">
                    <th className="font-normal">variant · size</th>
                    {BUTTON_STATES.map((st) => (
                      <th key={st} className="font-normal">
                        {st}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BUTTON_VARIANTS.flatMap((variant) =>
                    BUTTON_SIZES.map((size) => (
                      <tr key={`${variant}-${size}`}>
                        <td className="text-data-caption-13 text-surface-ink/60">
                          {variant} · {size}
                        </td>
                        {BUTTON_STATES.map((st) => (
                          <td key={st} data-preview-state={st}>
                            <Button variant={variant} size={size} disabled={st === 'disabled'}>
                              RSVP
                            </Button>
                          </td>
                        ))}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
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

          {/* ---- Series Tick ----------------------------------------- */}
          <section>
            <h2 className="text-header-3 mb-1">Series Tick</h2>
            <p className="text-data-caption-13 text-surface-ink/60 mb-4">
              series: bh · fc · video · tape · song-club — bg-series-* (aliases of bars/*),
              decorative + aria-hidden, sits before a catalogue ID
            </p>
            <div className="flex flex-col gap-3">
              {SERIES_SAMPLES.map((s) => (
                <div key={s.series} className="flex items-center gap-2">
                  <SeriesTick series={s.series} />
                  <span className="text-data-catalogue-id-16 font-bold">{s.id}</span>
                  <span className="text-data-caption-13 text-surface-ink/50">{s.series}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ---- Rail header ------------------------------------------ */}
          <section>
            <h2 className="text-header-3 mb-1">Rail header</h2>
            <p className="text-body-3 text-surface-ink/70 mb-4 max-w-prose">
              The site header (Figma 121:4273) rendered for sample routes — the active
              rail item comes from the route. Desktop at lg+, mobile below.
            </p>
            <div className="flex flex-col gap-8 [--rail-h:--spacing(1)]">
              {RAIL_ROUTES.map((path) => (
                <div key={path} data-rail-route={path}>
                  <div className="text-data-spec-12 text-surface-ink/50 mb-2">{path}</div>
                  <RailHeader
                    entries={NAV}
                    homeHref="/redesign/home"
                    tagline={TAGLINE}
                    stats={SAMPLE_STATS}
                    pathname={path}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ---- Mobile menu (open) ------------------------------------ */}
          <section>
            <h2 className="text-header-3 mb-1">Mobile menu (open)</h2>
            <p className="text-body-3 text-surface-ink/70 mb-4 max-w-prose">
              The open state of the mobile header (Figma 121:4273, Breakpoint = Mobile menu),
              rendered bare in a phone-sized frame per route. On the page it&apos;s a modal
              dialog opened from the menu button.
            </p>
            <div className="flex flex-wrap gap-6 [--rail-h:--spacing(1)]">
              {MENU_ROUTES.map((path) => (
                <div key={path} data-menu-route={path}>
                  <div className="text-data-spec-12 text-surface-ink/50 mb-2">{path}</div>
                  <div className="border-surface-ink/20 bg-surface-paper h-213 w-98.25 overflow-hidden border">
                    <MobileMenuPanel
                      entries={NAV}
                      active={activeRailItem(NAV, path)}
                      homeHref="/redesign/home"
                      tagline={TAGLINE}
                      stats={SAMPLE_STATS}
                      closeButton={
                        <span className="text-surface-ink">
                          <CloseIcon />
                        </span>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
