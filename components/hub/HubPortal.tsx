'use client';

import { useEffect, useState } from 'react';
import type { ShowHubData } from '@/lib/show-hub';
import type { PortalMessage } from '@/lib/hub-portal';
import HubSubmission from './HubSubmission';
import HubMessages from './HubMessages';

const OTHER = 'other' as const;
const ADMIN = 'admin' as const;
// Sentinel for "no band picked yet" — a band visitor must actively choose,
// so nobody submits an advance under a pre-selected (wrong) band.
const CHOOSE = 'choose' as const;
type Selection = number | typeof OTHER | typeof ADMIN | typeof CHOOSE;

// The interactive half of the show hub: bands identify themselves once (remembered
// per-link in localStorage), then upload a stage plot / input list and message the
// Birdhaus — all without a login. Everything writes through the token-gated
// /api/hub/[token] routes.
//
// `isAdmin` is true when the visitor has a valid admin session cookie (checked
// server-side): Alex opening a portal link is offered a "the Birdhaus" identity
// and defaults to it, so his message-board posts are attributed to the Birdhaus,
// not accidentally to whichever band the picker landed on. The admin post is
// re-verified server-side in the API — this prop only drives the UI.
export default function HubPortal({
  token,
  bands,
  schedule,
  initialMessages,
  isAdmin,
  adminShowId = null,
}: {
  token: string;
  bands: ShowHubData['inputsByBand'];
  schedule: ShowHubData['schedule'];
  initialMessages: PortalMessage[];
  isAdmin: boolean;
  // Set when the visitor is an admin — unlocks the message board's "also email
  // the lineup" option (see HubMessages).
  adminShowId?: number | null;
}) {
  // Deterministic first render so SSR and the first client render match: the
  // Birdhaus identity for an admin, else the "Choose your band" placeholder so
  // the visitor picks their own band (no accidental submit under a default).
  // The stored choice is applied in an effect after.
  const [selection, setSelection] = useState<Selection>(isAdmin ? ADMIN : CHOOSE);
  // The advance form is collapsed by default so it doesn't dominate the portal —
  // bands tap the header to open it when they're ready to submit.
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const storageKey = `birdhaus-hub-band:${token}`;

  // Restore the remembered choice once, after hydration. localStorage is a
  // client-only external system, so it can't seed the initial (SSR) render
  // without a hydration mismatch — syncing it in from an effect is the intended
  // pattern here. Skipped for an admin: they always default to the Birdhaus
  // identity rather than a band choice a previous session happened to store.
  useEffect(() => {
    if (isAdmin) return;
    let restored: Selection | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === OTHER) restored = OTHER;
      else if (stored !== null && bands.some((b) => b.bandId === Number(stored))) {
        restored = Number(stored);
      }
    } catch {
      // localStorage unavailable (private mode) — the default selection stands.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    if (restored !== null) setSelection(restored);
  }, [storageKey, bands, isAdmin]);

  function choose(value: Selection) {
    setSelection(value);
    try {
      window.localStorage.setItem(storageKey, String(value));
    } catch {
      // Ignore — not being remembered is harmless.
    }
  }

  const selectedBand = typeof selection === 'number' ? bands.find((b) => b.bandId === selection) : undefined;
  const isAdminPosting = selection === ADMIN;
  const bandIdForMessages = typeof selection === 'number' ? selection : null;

  function onSelectChange(value: string) {
    if (value === OTHER) choose(OTHER);
    else if (value === ADMIN) choose(ADMIN);
    else choose(Number(value));
  }

  // Radio options in display order: the Birdhaus (admin only), then each lineup
  // band, then the catch-all. For a band visitor none is checked until they pick
  // (selection starts at CHOOSE), so the choice is always deliberate.
  const identityOptions: Array<{ value: string; label: string }> = [
    ...(isAdmin ? [{ value: ADMIN, label: 'the Birdhaus (you)' }] : []),
    ...bands.map((b) => ({ value: String(b.bandId), label: b.name })),
    { value: OTHER, label: 'Sound engineer / someone else' },
  ];

  return (
    <div className="space-y-8">
      {/* Highlighted as the primary action so it isn't lost among the read-only
          sections — accent border/fill plus an explicit "action needed" cue. */}
      <section className="rounded-xl border-2 border-[#cf5b47]/60 bg-[#cf5b47]/[0.10] p-5 space-y-4">
        <button
          type="button"
          onClick={() => setAdvanceOpen((open) => !open)}
          aria-expanded={advanceOpen}
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-bold text-[#E8E0D0]">Submit your advance</h2>
            {!advanceOpen && (
              <p className="text-sm text-[#E8E0D0]/70 leading-relaxed">
                Tap to send us your stage plot / input list and a quick schedule check.
              </p>
            )}
          </div>
          <svg
            className={`mt-1 h-5 w-5 shrink-0 text-[#E8E0D0]/70 transition-transform ${advanceOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {advanceOpen && (
          <>
        <p className="text-sm text-[#E8E0D0]/70 leading-relaxed">
          Before the show we need a few things from each band — your stage plot /
          input list and a quick schedule check. Please take a minute to fill
          this out.
        </p>

        {/* Identity step — everything below keys off who this is. */}
        <fieldset className="rounded-lg border border-[#E8E0D0]/25 bg-[#2A2420]/40 p-4 space-y-3">
          <legend className="sr-only">Choose your band</legend>
          <div>
            <p className="text-base font-semibold text-[#E8E0D0]">Who are you?</p>
            <p className="text-xs text-[#E8E0D0]/55">Pick your band so we know whose advance this is.</p>
          </div>
          <div className="space-y-2">
            {identityOptions.map((opt) => {
              const checked = String(selection) === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors ${
                    checked
                      ? 'border-[#cf5b47]/70 bg-[#cf5b47]/[0.12]'
                      : 'border-[#E8E0D0]/15 hover:border-[#E8E0D0]/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="hub-band"
                    value={opt.value}
                    checked={checked}
                    onChange={() => onSelectChange(opt.value)}
                    className="h-4 w-4 accent-[#cf5b47]"
                  />
                  <span className="text-sm text-[#E8E0D0]/90">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* The form is always shown so bands see what's coming, but it stays
            disabled (dimmed, non-interactive) until they pick a band above. */}
        <div className="pt-1">
          {selectedBand ? (
            <p className="text-sm text-[#E8E0D0]/60 pb-4">
              A few quick things from{' '}
              <span className="text-[#E8E0D0] font-medium">{selectedBand.name}</span>:
            </p>
          ) : (
            <p className="text-sm text-[#E8E0D0]/60 pb-4">
              {isAdminPosting
                ? 'Posting as the Birdhaus — pick a band above to submit a stage plot or input list on their behalf.'
                : '👆 Pick your band above to fill this out. (You can still post to the message board below.)'}
            </p>
          )}
          <HubSubmission
            key={selectedBand?.bandId ?? 'none'}
            token={token}
            band={selectedBand ?? null}
            schedule={schedule}
            disabled={!selectedBand}
          />
        </div>
          </>
        )}
      </section>

      <Card title="Message board">
        <HubMessages
          token={token}
          initialMessages={initialMessages}
          bandId={bandIdForMessages}
          asAdmin={isAdminPosting}
          adminShowId={isAdminPosting ? adminShowId : null}
        />
      </Card>
    </div>
  );
}

// Matches the read-only sections' card styling in app/hub/[token]/page.tsx.
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[#E8E0D0]/15 rounded-xl p-5 space-y-4">
      <h2 className="text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
