'use client';

import { useEffect, useState } from 'react';
import type { ShowHubData } from '@/lib/show-hub';
import type { PortalMessage } from '@/lib/hub-portal';
import HubSubmission from './HubSubmission';
import HubMessages from './HubMessages';

const OTHER = 'other' as const;
const ADMIN = 'admin' as const;
type Selection = number | typeof OTHER | typeof ADMIN;

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
  // Birdhaus identity for an admin, else the first band (or "other" if none).
  // The stored choice is applied in an effect after.
  const [selection, setSelection] = useState<Selection>(
    isAdmin ? ADMIN : (bands[0]?.bandId ?? OTHER)
  );
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

  return (
    <div className="space-y-8">
      <Card title="Submit your advance">
        {/* Prominent identity step — everything below keys off who this is. */}
        <div className="rounded-lg border border-[#c8a26a]/40 bg-[#c8a26a]/[0.07] p-4 space-y-2">
          <label htmlFor="hub-band" className="block text-base font-semibold text-[#E8E0D0]">
            Who are you?
          </label>
          <p className="text-xs text-[#E8E0D0]/55">Pick your band so we know whose advance this is.</p>
          <select
            id="hub-band"
            value={String(selection)}
            onChange={(e) => onSelectChange(e.target.value)}
            className="w-full bg-transparent border border-[#E8E0D0]/40 rounded px-3 py-2.5 text-base focus:outline-none focus:border-[#E8E0D0] [&>option]:bg-[#2A2420]"
          >
            {isAdmin && <option value={ADMIN}>the Birdhaus (you)</option>}
            {bands.map((b) => (
              <option key={b.bandId} value={String(b.bandId)}>
                {b.name}
              </option>
            ))}
            <option value={OTHER}>Sound engineer / someone else</option>
          </select>
        </div>

        {selectedBand ? (
          <div className="pt-1">
            <p className="text-sm text-[#E8E0D0]/60 pb-4">
              A few quick things from{' '}
              <span className="text-[#E8E0D0] font-medium">{selectedBand.name}</span>:
            </p>
            <HubSubmission
              key={selectedBand.bandId}
              token={token}
              band={selectedBand}
              schedule={schedule}
            />
          </div>
        ) : (
          <p className="text-sm text-[#E8E0D0]/50 pt-2">
            {isAdminPosting
              ? 'Posting as the Birdhaus. Pick a band above if you need to submit a stage plot or input list on their behalf.'
              : 'Pick your band above to upload a stage plot or build an input list. You can still send a message below.'}
          </p>
        )}
      </Card>

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
