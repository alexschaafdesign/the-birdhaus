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
  const [exportingId, setExportingId] = useState<number | null>(null);

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

  // Export a board preset's run-of-show as a PNG — the source frame for a Roku
  // schedule-loop video. Renders the preset through the real tube in a hidden
  // 640×480 iframe (/tv?export=1&presetId=N) and captures it via the hook the
  // tube exposes. Read-only: the live tube is never touched. Board presets only.
  async function exportPng(p: PresetSummary) {
    // The schedule is often made days ahead, so ask what date to stamp on it
    // rather than locking in today's. Blank = today. Defaults to today so the
    // format is obvious and only the day needs changing.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const input = window.prompt('Date to show on the schedule (YYYY-MM-DD):', today);
    if (input === null) return; // cancelled
    const date = input.trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be YYYY-MM-DD (or blank for today).');
      return;
    }

    setError(null);
    setExportingId(p.id);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:480px;border:0;';
    iframe.src = `/tv?mode=board&export=1&presetId=${p.id}${date ? `&date=${date}` : ''}`;
    document.body.appendChild(iframe);
    try {
      const dataUrl = await new Promise<string | null>((resolve, reject) => {
        const start = Date.now();
        const tick = async () => {
          const w = iframe.contentWindow as
            | (Window & { __tvExportPng?: () => Promise<string | null> })
            | null;
          if (w?.__tvExportPng) {
            try {
              resolve(await w.__tvExportPng());
            } catch (e) {
              reject(e);
            }
            return;
          }
          if (Date.now() - start > 12000) {
            reject(new Error('the tube preview did not load'));
            return;
          }
          setTimeout(tick, 150);
        };
        iframe.addEventListener('load', tick);
      });
      if (dataUrl) {
        const slug =
          p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'schedule';
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `schedule-${slug}${date ? `-${date}` : ''}.png`;
        a.click();
      }
    } catch (e) {
      setError(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed');
    } finally {
      iframe.remove();
      setExportingId(null);
    }
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
              {category === 'board' && (
                <button
                  type="button"
                  onClick={() => exportPng(p)}
                  disabled={exportingId === p.id}
                  title="Download this schedule as a PNG (for the Roku loop)"
                  className="text-xs text-[#E8E0D0]/45 hover:text-[#E8E0D0] disabled:opacity-40"
                >
                  {exportingId === p.id ? 'exporting…' : 'export'}
                </button>
              )}
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
