'use client';

import { useState } from 'react';
import type { StandingHour } from '@/lib/rehearsal/settings';

// Weekly template of block start times. One row per weekday, Monday first;
// each start shows the block it makes at the current block length.

const DAYS: Array<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Mon' },
  { weekday: 2, label: 'Tue' },
  { weekday: 3, label: 'Wed' },
  { weekday: 4, label: 'Thu' },
  { weekday: 5, label: 'Fri' },
  { weekday: 6, label: 'Sat' },
  { weekday: 0, label: 'Sun' },
];

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function clock(minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, '0')}${suffix}`;
}

function blockLabel(start: string, blockMinutes: number) {
  const s = toMinutes(start);
  const e = s + blockMinutes;
  return `${clock(s)}–${clock(e)}${e >= 1440 ? ' (+1)' : ''}`;
}

const key = (h: StandingHour) => `${h.weekday} ${h.startTime}`;

// Start times offered, every 30 minutes: daytime and evening first, then the
// small hours (a late block) at the end.
const pad = (n: number) => String(n).padStart(2, '0');
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);
const START_GROUPS: Array<{ label: string; times: string[] }> = [
  { label: 'Morning', times: HALF_HOURS.slice(12, 24) }, // 6:00–11:30
  { label: 'Afternoon', times: HALF_HOURS.slice(24, 34) }, // 12:00–4:30
  { label: 'Evening', times: HALF_HOURS.slice(34, 48) }, // 5:00–11:30
  { label: 'Late night', times: HALF_HOURS.slice(0, 12) }, // 12:00–5:30am
];

// Would a block starting at `start` overlap one already on this day?
function clashes(start: string, existing: string[], blockMinutes: number) {
  const s = toMinutes(start);
  return existing.some((e) => Math.abs(toMinutes(e) - s) < blockMinutes);
}

export default function StandingHoursEditor({
  initial,
  blockMinutes,
}: {
  initial: StandingHour[];
  blockMinutes: number;
}) {
  const [saved, setSaved] = useState(initial);
  const [hours, setHours] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = hours.map(key).sort().join('|') !== saved.map(key).sort().join('|');

  function add(weekday: number, startTime: string) {
    if (!startTime) return;
    if (!hours.some((h) => h.weekday === weekday && h.startTime === startTime)) {
      setHours([...hours, { weekday, startTime }]);
    }
  }

  function remove(target: StandingHour) {
    setHours(hours.filter((h) => key(h) !== key(target)));
  }

  function copyToAll(weekday: number) {
    const times = hours.filter((h) => h.weekday === weekday).map((h) => h.startTime);
    setHours(DAYS.flatMap((d) => times.map((startTime) => ({ weekday: d.weekday, startTime }))));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch('/api/admin/rehearsal/hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setSaved(data.hours);
      setHours(data.hours);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-[#E8E0D0]/10 rounded-lg border border-[#E8E0D0]/15">
        {DAYS.map(({ weekday, label }) => {
          const starts = hours
            .filter((h) => h.weekday === weekday)
            .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="w-12 text-sm font-semibold uppercase tracking-wide">{label}</span>
              {starts.length === 0 && <span className="text-sm text-[#E8E0D0]/40">No blocks</span>}
              {starts.map((h) => (
                <span
                  key={key(h)}
                  className="inline-flex items-center gap-1.5 rounded border border-[#E8E0D0]/30 px-2 py-1 text-sm"
                >
                  {blockLabel(h.startTime, blockMinutes)}
                  <button
                    type="button"
                    onClick={() => remove(h)}
                    aria-label={`Remove ${label} ${blockLabel(h.startTime, blockMinutes)}`}
                    className="text-[#E8E0D0]/50 hover:text-red-300"
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="ml-auto flex items-center gap-2">
                <select
                  value=""
                  onChange={(e) => add(weekday, e.target.value)}
                  aria-label={`Add a ${label} block`}
                  className="rounded border border-[#E8E0D0]/30 bg-[#171412] px-2 py-1 text-sm [color-scheme:dark]"
                >
                  <option value="">+ Add a block…</option>
                  {START_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.times.map((t) => {
                        const taken = clashes(t, starts.map((h) => h.startTime), blockMinutes);
                        return (
                          <option key={t} value={t} disabled={taken}>
                            {blockLabel(t, blockMinutes)}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
                {starts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => copyToAll(weekday)}
                    className="text-xs text-[#E8E0D0]/50 underline hover:text-[#E8E0D0]"
                  >
                    Copy to every day
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">{error}</div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save standing hours'}
        </button>
        {savedAt && !dirty && <span className="text-sm text-[#E8E0D0]/50">Saved at {savedAt}</span>}
        {dirty && !saving && <span className="text-sm text-[#E8E0D0]/40">Unsaved changes</span>}
      </div>
    </div>
  );
}
