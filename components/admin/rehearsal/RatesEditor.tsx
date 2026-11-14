'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RateCard } from '@/lib/rehearsal/settings';
import { estimateLine } from '@/lib/rehearsal/estimate';

// The informal rate card. Display-only: shown on /rehearsal and in the invite,
// and as soft "usual rate" lines on the review sheet and to Alex. Never a bill.

const label = 'block text-xs uppercase tracking-wide text-[#E8E0D0]/60';
const input =
  'w-full rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0]/60 [color-scheme:dark]';

function dollars(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

function toCents(raw: string): number | null {
  const t = raw.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

type PkgRow = { hours: string; price: string };

export default function RatesEditor({ initial }: { initial: RateCard }) {
  const router = useRouter();
  const [hourly, setHourly] = useState(dollars(initial.rateHourlyCents));
  const [pkgs, setPkgs] = useState<PkgRow[]>(
    initial.ratePackages.map((p) => ({ hours: String(p.minutes / 60), price: dollars(p.cents) })),
  );
  const [regular, setRegular] = useState(initial.rateRegularText);
  const [flexible, setFlexible] = useState(initial.rateFlexibleText);
  const [estimates, setEstimates] = useState(initial.estimatesEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // What the form would save, or an error to show.
  function card(): RateCard | string {
    const h = toCents(hourly);
    if (h === null) return 'Hourly rate: a dollar amount, like 20.';
    const ratePackages = [];
    for (const p of pkgs) {
      if (!p.hours.trim() && !p.price.trim()) continue;
      const minutes = Math.round(Number(p.hours) * 60);
      const cents = toCents(p.price);
      if (!Number.isFinite(minutes) || minutes < 30 || minutes % 30 !== 0) return 'Package lengths are hours, in halves (3, 4.5…).';
      if (cents === null) return 'Package prices: a dollar amount, like 50.';
      ratePackages.push({ minutes, cents });
    }
    return {
      rateHourlyCents: h,
      ratePackages,
      rateRegularText: regular,
      rateFlexibleText: flexible,
      estimatesEnabled: estimates,
    };
  }

  async function save() {
    const body = card();
    if (typeof body === 'string') {
      setError(body);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/rehearsal/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const preview = card();

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={label}>Hourly rate (dollars)</span>
            <input value={hourly} onChange={(e) => setHourly(e.target.value)} inputMode="decimal" className={`${input} max-w-32`} />
          </label>
          <div className="space-y-1.5">
            <span className={label}>Packages</span>
            {pkgs.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <input
                  aria-label="Package hours"
                  value={p.hours}
                  onChange={(e) => setPkgs(pkgs.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))}
                  inputMode="decimal"
                  className={`${input} max-w-20`}
                />
                <span className="text-[#E8E0D0]/50">hours for $</span>
                <input
                  aria-label="Package price"
                  value={p.price}
                  onChange={(e) => setPkgs(pkgs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  inputMode="decimal"
                  className={`${input} max-w-24`}
                />
                <button
                  type="button"
                  onClick={() => setPkgs(pkgs.filter((_, j) => j !== i))}
                  className="text-xs text-[#E8E0D0]/50 underline hover:text-[#E8E0D0]"
                >
                  Remove
                </button>
              </div>
            ))}
            {pkgs.length < 8 && (
              <button
                type="button"
                onClick={() => setPkgs([...pkgs, { hours: '', price: '' }])}
                className="text-xs text-[#E8E0D0]/60 underline hover:text-[#E8E0D0]"
              >
                + Add a package
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={estimates} onChange={(e) => setEstimates(e.target.checked)} />
            Show a soft &ldquo;usual rate&rdquo; line on the review sheet and to you
          </label>
        </div>
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={label}>Regular deal</span>
            <textarea value={regular} onChange={(e) => setRegular(e.target.value)} maxLength={500} rows={2} className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className={label}>Flexible line</span>
            <textarea value={flexible} onChange={(e) => setFlexible(e.target.value)} maxLength={1000} rows={3} className={input} />
          </label>
        </div>
      </div>

      {typeof preview !== 'string' && (
        <p className="text-xs text-[#E8E0D0]/50">
          Estimates: {[60, 120, 180, 240, 360].map((m) => estimateLine(m, null, preview).replace('Usual rate for ', '')).join(' · ')} ·{' '}
          weekly 3 h → {estimateLine(180, 'weekly', preview).replace('Regular rate: ', '')}. Cheapest mix of packages and
          hourly; a weekly slot pays for 3 of every 4.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save rates'}
        </button>
        {savedAt && <span className="text-sm text-[#E8E0D0]/50">Saved at {savedAt}</span>}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </div>
  );
}
