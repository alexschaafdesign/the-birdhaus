'use client';

import { useEffect, useState } from 'react';

// Modal to add existing show flyers into the screensaver pool. Pick any number
// of flyers; each becomes a pool image (url = the show's flyer, caption = the
// show title). onAdded refreshes the pool list.

interface ShowFlyer {
  id: number;
  title: string;
  date: string;
  flyer: string;
}

export default function ShowFlyerPicker({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [flyers, setFlyers] = useState<ShowFlyer[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/show-flyers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load flyers'))))
      .then(setFlyers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load flyers'));
  }, []);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    if (!flyers || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Add sequentially so pool order is stable and one failure is isolated.
      for (const show of flyers) {
        if (!selected.has(show.id)) continue;
        const res = await fetch('/api/admin/tv-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: show.flyer, caption: show.title }),
        });
        if (!res.ok) throw new Error(`Could not add "${show.title}"`);
      }
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add flyers');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#1b1712] border border-[#E8E0D0]/20 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col text-[#E8E0D0]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#E8E0D0]/15">
          <h3 className="font-bold">Add show flyers to the screensaver</h3>
          <button type="button" onClick={onClose} className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]">
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          {flyers === null ? (
            <p className="text-sm text-[#E8E0D0]/50">Loading flyers…</p>
          ) : flyers.length === 0 ? (
            <p className="text-sm text-[#E8E0D0]/50">No shows with flyers found.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {flyers.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={`text-left rounded border overflow-hidden transition-colors ${
                      on ? 'border-[#E8E0D0] ring-2 ring-[#E8E0D0]/40' : 'border-[#E8E0D0]/15 hover:border-[#E8E0D0]/40'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.flyer} alt="" className="w-full aspect-[3/4] object-cover bg-black/40" />
                    <div className="p-1.5">
                      <div className="text-xs truncate">{s.title}</div>
                      <div className="text-[10px] text-[#E8E0D0]/40">{s.date}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-[#E8E0D0]/15">
          <span className="text-sm text-[#E8E0D0]/50">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addSelected}
              disabled={busy || selected.size === 0}
              className="text-sm border border-[#E8E0D0] bg-[#E8E0D0]/10 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/20 disabled:opacity-40"
            >
              {busy ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
