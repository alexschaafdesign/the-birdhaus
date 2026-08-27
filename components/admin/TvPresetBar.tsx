'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PresetCategory, PresetSummary } from '@/lib/tv-presets';

// Save / apply named presets for one TV category (screensaver, board, cards).
// "Save current" snapshots the scope's content; "Apply" copies a preset back
// into the scope (then reloads so the editors reflect it). Screensaver presets
// are global; board/cards presets apply to whatever scope (global or show) this
// bar is rendered in.

const UNIT: Record<PresetCategory, string> = {
  screensaver: 'images',
  board: 'rows',
  cards: 'cards',
};

const chip =
  'text-xs border rounded px-3 py-1.5 transition-colors whitespace-nowrap disabled:opacity-40';

export default function TvPresetBar({
  category,
  showId = null,
}: {
  category: PresetCategory;
  showId?: number | null;
}) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/tv-presets?category=${category}`, { cache: 'no-store' });
    if (res.ok) setPresets(await res.json());
  }, [category]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function saveCurrent() {
    const name = window.prompt('Save the current content as a preset — name it:')?.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/tv-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, name, showId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Save failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function apply(p: PresetSummary) {
    if (
      !confirm(
        `Apply "${p.name}"? This replaces the current content${showId ? ' for this show' : ''}.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tv-presets/${p.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId }),
      });
      if (!res.ok) throw new Error('Apply failed');
      window.location.reload(); // editors are seeded server-side; reload to reflect
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
      setBusy(false);
    }
  }

  async function rename(p: PresetSummary) {
    const name = window.prompt('Rename preset:', p.name)?.trim();
    if (!name || name === p.name) return;
    const res = await fetch(`/api/admin/tv-presets/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) await refresh();
    else setError((await res.json().catch(() => null))?.error || 'Rename failed');
  }

  async function remove(p: PresetSummary) {
    if (!confirm(`Delete preset "${p.name}"?`)) return;
    const res = await fetch(`/api/admin/tv-presets/${p.id}`, { method: 'DELETE' });
    if (res.ok) setPresets((prev) => prev.filter((x) => x.id !== p.id));
  }

  return (
    <div className="rounded border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs uppercase tracking-wide text-[#E8E0D0]/45">Presets</span>
        <button
          type="button"
          onClick={saveCurrent}
          disabled={busy}
          className={`${chip} border-[#E8E0D0]/30 text-[#E8E0D0]/70 hover:text-[#E8E0D0]`}
        >
          Save current…
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {presets.length === 0 ? (
        <p className="text-xs text-[#E8E0D0]/35">No saved presets yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => apply(p)}
                disabled={busy}
                className={`${chip} border-[#E8E0D0] bg-[#E8E0D0]/10 text-[#E8E0D0]`}
              >
                Apply
              </button>
              <span className="text-sm text-[#E8E0D0]">{p.name}</span>
              <span className="text-xs text-[#E8E0D0]/40">
                {p.count} {UNIT[category]}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => rename(p)}
                className="text-xs text-[#E8E0D0]/45 hover:text-[#E8E0D0]"
              >
                rename
              </button>
              <button
                type="button"
                onClick={() => remove(p)}
                className="text-xs text-red-300/70 hover:text-red-300"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
