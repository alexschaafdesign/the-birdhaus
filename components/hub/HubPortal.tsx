'use client';

import { useEffect, useState } from 'react';
import type { ShowHubData } from '@/lib/show-hub';
import type { PortalMessage } from '@/lib/hub-portal';
import HubSubmission from './HubSubmission';
import HubMessages from './HubMessages';

const OTHER = 'other' as const;
type Selection = number | typeof OTHER;

// The interactive half of the show hub: bands identify themselves once (remembered
// per-link in localStorage), then upload a stage plot / input list and message the
// Birdhaus — all without a login. Everything writes through the token-gated
// /api/hub/[token] routes.
export default function HubPortal({
  token,
  bands,
  initialMessages,
}: {
  token: string;
  bands: ShowHubData['inputsByBand'];
  initialMessages: PortalMessage[];
}) {
  // Deterministic first render (first band, or "other" if none) so SSR and the
  // first client render match; the stored choice is applied in an effect after.
  const [selection, setSelection] = useState<Selection>(bands[0]?.bandId ?? OTHER);
  const storageKey = `birdhaus-hub-band:${token}`;

  // Restore the remembered choice once, after hydration. localStorage is a
  // client-only external system, so it can't seed the initial (SSR) render
  // without a hydration mismatch — syncing it in from an effect is the intended
  // pattern here.
  useEffect(() => {
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
  }, [storageKey, bands]);

  function choose(value: Selection) {
    setSelection(value);
    try {
      window.localStorage.setItem(storageKey, String(value));
    } catch {
      // Ignore — not being remembered is harmless.
    }
  }

  const selectedBand = typeof selection === 'number' ? bands.find((b) => b.bandId === selection) : undefined;
  const bandIdForMessages = typeof selection === 'number' ? selection : null;

  return (
    <div className="space-y-8">
      <Card title="Submit your advance">
        <div className="space-y-2">
          <label htmlFor="hub-band" className="block text-sm text-[#E8E0D0]/70">
            Who&apos;s submitting?
          </label>
          <select
            id="hub-band"
            value={String(selection)}
            onChange={(e) => choose(e.target.value === OTHER ? OTHER : Number(e.target.value))}
            className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0] [&>option]:bg-[#2A2420]"
          >
            {bands.map((b) => (
              <option key={b.bandId} value={String(b.bandId)}>
                {b.name}
              </option>
            ))}
            <option value={OTHER}>Sound engineer / someone else</option>
          </select>
        </div>

        {selectedBand ? (
          <div className="pt-2">
            <HubSubmission key={selectedBand.bandId} token={token} band={selectedBand} />
          </div>
        ) : (
          <p className="text-sm text-[#E8E0D0]/50 pt-2">
            Pick your band above to upload a stage plot or build an input list. You can still send a
            message below.
          </p>
        )}
      </Card>

      <Card title="Messages">
        <HubMessages token={token} initialMessages={initialMessages} bandId={bandIdForMessages} />
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
