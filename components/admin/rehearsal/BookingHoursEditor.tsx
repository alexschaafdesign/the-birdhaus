'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingRules, DayWindow } from '@/lib/rehearsal/settings';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// Booking hours: one broad window per weekday (an outer limit — everything
// inside is open unless a show, block, busy time or booking takes it), plus
// how bands pick inside it: start-time step, lengths, and the turnover buffer.

const DAYS: Array<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Mon' },
  { weekday: 2, label: 'Tue' },
  { weekday: 3, label: 'Wed' },
  { weekday: 4, label: 'Thu' },
  { weekday: 5, label: 'Fri' },
  { weekday: 6, label: 'Sat' },
  { weekday: 0, label: 'Sun' },
];

const label = FORM.label;
const select = `${FIELD_INLINE} cursor-pointer disabled:opacity-40`;

const pad = (n: number) => String(n).padStart(2, '0');
const HALF_HOURS = Array.from({ length: 49 }, (_, i) => (i === 48 ? '24:00' : `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`));

function clock(hhmm: string): string {
  if (hhmm === '24:00') return 'midnight';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

function hours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

const LENGTH_CHOICES = [60, 90, 120, 150, 180, 240, 300, 360, 480];
const MINMAX_CHOICES = [30, 60, 90, 120, 180, 240, 360, 480, 720];

export default function BookingHoursEditor({ initialWindows, initialRules }: { initialWindows: DayWindow[]; initialRules: BookingRules }) {
  const router = useRouter();
  const [windows, setWindows] = useState(initialWindows);
  const [rules, setRules] = useState(initialRules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function setDay(weekday: number, patch: Partial<DayWindow>) {
    setWindows((list) => list.map((w) => (w.weekday === weekday ? { ...w, ...patch } : w)));
    setSavedAt(null);
  }

  function setRule<K extends keyof BookingRules>(k: K, v: BookingRules[K]) {
    setRules((r) => ({ ...r, [k]: v }));
    setSavedAt(null);
  }

  function copyToAll(weekday: number) {
    const src = windows.find((w) => w.weekday === weekday);
    if (!src) return;
    setWindows((list) => list.map((w) => ({ ...w, opens: src.opens, closes: src.closes, closed: src.closed })));
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/rehearsal/booking-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Lengths outside min–max are dropped (they show unticked).
        body: JSON.stringify({
          windows,
          rules: { ...rules, allowedLengths: rules.allowedLengths.filter((l) => l >= rules.minMinutes && l <= rules.maxMinutes) },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setWindows(data.windows);
      setRules(data.rules);
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="divide-y divide-surface-ink/20 border border-surface-ink">
        {DAYS.map(({ weekday, label: day }) => {
          const w = windows.find((x) => x.weekday === weekday);
          if (!w) return null;
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-body-3">
              <span className={`${ADMIN_TYPE.overline} w-12`}>{day}</span>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="accent-surface-ink size-4" checked={!w.closed} onChange={(e) => setDay(weekday, { closed: !e.target.checked })} />
                Open
              </label>
              <select
                aria-label={`${day} opens`}
                value={w.opens}
                disabled={w.closed}
                onChange={(e) => setDay(weekday, { opens: e.target.value })}
                className={select}
              >
                {HALF_HOURS.slice(0, 48).map((t) => (
                  <option key={t} value={t}>
                    {clock(t)}
                  </option>
                ))}
              </select>
              <span className="text-surface-ink/60">to</span>
              <select
                aria-label={`${day} closes`}
                value={w.closes}
                disabled={w.closed}
                onChange={(e) => setDay(weekday, { closes: e.target.value })}
                className={select}
              >
                {HALF_HOURS.slice(1).map((t) => (
                  <option key={t} value={t}>
                    {clock(t)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => copyToAll(weekday)} className={`ml-auto text-data-caption-13 ${ADMIN_TYPE.link}`}>
                Copy to every day
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5">
          <span className={label}>Start times every</span>
          <select value={rules.startStepMinutes} onChange={(e) => setRule('startStepMinutes', Number(e.target.value))} className={select}>
            {[15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={label}>Shortest booking</span>
          <select value={rules.minMinutes} onChange={(e) => setRule('minMinutes', Number(e.target.value))} className={select}>
            {MINMAX_CHOICES.map((m) => (
              <option key={m} value={m}>
                {hours(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={label}>Longest booking</span>
          <select value={rules.maxMinutes} onChange={(e) => setRule('maxMinutes', Number(e.target.value))} className={select}>
            {MINMAX_CHOICES.map((m) => (
              <option key={m} value={m}>
                {hours(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={label}>Turnover between bands</span>
          <select value={rules.bufferMinutes} onChange={(e) => setRule('bufferMinutes', Number(e.target.value))} className={select}>
            {[0, 15, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'none' : `${m} minutes`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className={label}>Lengths bands can pick</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-body-3">
          {LENGTH_CHOICES.map((m) => {
            const outside = m < rules.minMinutes || m > rules.maxMinutes;
            return (
              <label key={m} className={`flex items-center gap-2 ${outside ? 'opacity-40' : ''}`}>
                <input
                  type="checkbox" className="accent-surface-ink size-4"
                  disabled={outside}
                  checked={rules.allowedLengths.includes(m) && !outside}
                  onChange={(e) =>
                    setRule(
                      'allowedLengths',
                      e.target.checked
                        ? [...rules.allowedLengths, m].sort((a, b) => a - b)
                        : rules.allowedLengths.filter((x) => x !== m),
                    )
                  }
                />
                {hours(m)}
              </label>
            );
          })}
        </div>
        <p className="text-data-caption-13 text-surface-ink/60">
          Bands only see lengths that fit from the start time they pick. Existing bookings and approved repeats keep their
          times.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={buttonClassName('primary', 's')}
        >
          {saving ? 'Saving…' : 'Save booking hours'}
        </button>
        {savedAt && <span className="text-body-3 text-surface-ink/60">Saved at {savedAt}</span>}
        {error && <span role="alert" className={FORM.error}>{error}</span>}
      </div>
    </div>
  );
}
