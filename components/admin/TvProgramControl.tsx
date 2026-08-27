'use client';

import { useEffect, useState } from 'react';
import ScheduleEditor from './ScheduleEditor';
import type { ScheduleRow } from '@/lib/advance';
import type { TvMode, TvProgram, ScheduleWindow } from '@/lib/tv-program';

// Global TV program control: what's on the tube right now (override), the
// default mode, the time-window schedule, and the 'board' mode content. Every
// change PATCHes /api/admin/tv-program; the Pi picks it up on its next poll
// (~60s). Phase 1 is the global program; per-show lands in phase 2.

const MODE_LABEL: Record<TvMode, string> = {
  screensaver: 'Screensaver',
  board: 'Schedule board',
  cards: 'Announcement cards',
};
const MODES: TvMode[] = ['screensaver', 'board', 'cards'];

const DAY_START_MIN = 4 * 60;
function slotOfHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  let mins = hh * 60 + mm;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}
function venueNowSlot(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  let mins = hh * 60 + mm;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}
// Is the override set and not yet expired?
function overrideOn(program: TvProgram): boolean {
  if (!program.overrideMode) return false;
  if (!program.overrideExpiresAt) return true;
  return new Date(program.overrideExpiresAt).getTime() > Date.now();
}
// Mirrors lib/tv-program resolveMode — kept local so the admin can show what's
// live without a round trip.
function resolveLive(program: TvProgram): { mode: TvMode; source: 'override' | 'schedule' | 'default' } {
  if (overrideOn(program)) return { mode: program.overrideMode as TvMode, source: 'override' };
  const nowSlot = venueNowSlot();
  let mode: TvMode = program.defaultMode;
  let source: 'schedule' | 'default' = 'default';
  const windows = program.schedule
    .map((w) => ({ slot: slotOfHHMM(w.from), mode: w.mode }))
    .filter((w): w is { slot: number; mode: TvMode } => w.slot !== null)
    .sort((a, b) => a.slot - b.slot);
  for (const w of windows) {
    if (nowSlot >= w.slot) {
      mode = w.mode;
      source = 'schedule';
    }
  }
  return { mode, source };
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] [&>option]:bg-[#2A2420]';
const chip =
  'text-sm border rounded px-3 py-1.5 transition-colors whitespace-nowrap disabled:opacity-40';

export default function TvProgramControl({
  initialProgram,
  showId = null,
  bandNames = [],
}: {
  initialProgram: TvProgram;
  // null = the global default program; a number = that show's program.
  showId?: number | null;
  // Lineup for the board's "prefill from lineup" (empty for the global program).
  bandNames?: string[];
}) {
  const [program, setProgram] = useState<TvProgram>(initialProgram);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-tick so the "what's live now" readout follows the schedule clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  async function save(patch: Partial<Record<string, unknown>>, optimistic: Partial<TvProgram>) {
    setError(null);
    setSaving(true);
    const prev = program;
    setProgram((p) => ({ ...p, ...optimistic }));
    try {
      const res = await fetch('/api/admin/tv-program', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, showId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Save failed');
      }
    } catch (err) {
      setProgram(prev); // roll back on failure
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const live = resolveLive(program);
  const boardRows: ScheduleRow[] = program.boardRows.map((r) => ({ time: r.time, label: r.label }));

  return (
    <div className="text-[#E8E0D0] space-y-8">
      {/* What's live now + override */}
      <section>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-sm uppercase tracking-wide text-[#E8E0D0]/50">On the tube now</h3>
          <span className="text-lg font-bold">{MODE_LABEL[live.mode]}</span>
          <span className="text-xs text-[#E8E0D0]/40">
            {live.source === 'override'
              ? '· forced'
              : live.source === 'schedule'
                ? '· from schedule'
                : '· default'}
          </span>
          {saving && <span className="text-xs text-[#E8E0D0]/40">saving…</span>}
        </div>
        <p className="text-xs text-[#E8E0D0]/45 mt-1 mb-3">
          Force a mode now (wins over the schedule until you clear it), or leave it on Auto to follow
          the schedule/default. Changes reach the TV within ~60s.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {MODES.map((m) => {
            const on = overrideOn(program) && program.overrideMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => save({ overrideMode: m }, { overrideMode: m, overrideExpiresAt: null })}
                className={`${chip} ${
                  on
                    ? 'border-[#E8E0D0] bg-[#E8E0D0]/10 text-[#E8E0D0]'
                    : 'border-[#E8E0D0]/30 text-[#E8E0D0]/70 hover:text-[#E8E0D0]'
                }`}
              >
                Force {MODE_LABEL[m]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => save({ overrideMode: null }, { overrideMode: null, overrideExpiresAt: null })}
            disabled={!overrideOn(program)}
            className={`${chip} border-[#E8E0D0]/30 text-[#E8E0D0]/70 hover:text-[#E8E0D0]`}
          >
            Auto (clear override)
          </button>
        </div>

        {overrideOn(program) && (
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-[#E8E0D0]/60">
            <span>Auto-clear:</span>
            {[
              { label: '1h', mins: 60 },
              { label: '3h', mins: 180 },
              { label: '6h', mins: 360 },
            ].map(({ label, mins }) => (
              <button
                key={mins}
                type="button"
                onClick={() =>
                  save(
                    { overrideExpireInMinutes: mins },
                    { overrideExpiresAt: new Date(Date.now() + mins * 60_000).toISOString() }
                  )
                }
                className="border border-[#E8E0D0]/25 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
              >
                +{label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => save({ overrideExpireInMinutes: null }, { overrideExpiresAt: null })}
              disabled={!program.overrideExpiresAt}
              className="border border-[#E8E0D0]/25 rounded px-2 py-1 hover:bg-[#E8E0D0]/10 disabled:opacity-40"
            >
              Off
            </button>
            {program.overrideExpiresAt && (
              <span className="text-[#E8E0D0]/45">
                clears in{' '}
                {Math.max(
                  0,
                  Math.round((new Date(program.overrideExpiresAt).getTime() - Date.now()) / 60_000)
                )}
                m
              </span>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </section>

      {/* Default mode + schedule windows */}
      <section>
        <h3 className="text-sm uppercase tracking-wide text-[#E8E0D0]/50 mb-2">Schedule</h3>
        <label className="flex items-center gap-2 text-sm mb-4">
          <span className="text-[#E8E0D0]/60">Default mode</span>
          <select
            value={program.defaultMode}
            onChange={(e) => save({ defaultMode: e.target.value }, { defaultMode: e.target.value as TvMode })}
            className={inputClass}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
          <span className="text-xs text-[#E8E0D0]/40">shown before the first window</span>
        </label>

        <div className="space-y-2">
          {program.schedule.map((w, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#E8E0D0]/50 w-10">at</span>
              <input
                type="time"
                value={w.from}
                onChange={(e) => {
                  const next = program.schedule.map((x, idx) =>
                    idx === i ? { ...x, from: e.target.value } : x
                  );
                  save({ schedule: next }, { schedule: next });
                }}
                className={inputClass}
              />
              <span className="text-xs text-[#E8E0D0]/50">show</span>
              <select
                value={w.mode}
                onChange={(e) => {
                  const next = program.schedule.map((x, idx) =>
                    idx === i ? { ...x, mode: e.target.value as TvMode } : x
                  );
                  save({ schedule: next }, { schedule: next });
                }}
                className={inputClass}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const next = program.schedule.filter((_, idx) => idx !== i);
                  save({ schedule: next }, { schedule: next });
                }}
                className="text-[#E8E0D0]/40 hover:text-red-300 text-sm px-1"
                aria-label="Remove window"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const next: ScheduleWindow[] = [...program.schedule, { from: '19:00', mode: 'board' }];
              save({ schedule: next }, { schedule: next });
            }}
            className="text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] border border-[#E8E0D0]/25 rounded px-3 py-1.5"
          >
            + Add window
          </button>
        </div>
      </section>

      {/* Board mode content */}
      <section>
        <h3 className="text-sm uppercase tracking-wide text-[#E8E0D0]/50 mb-1">
          Schedule board content
        </h3>
        <p className="text-xs text-[#E8E0D0]/45 mb-3">
          The run-of-show shown on the tube in “Schedule board” mode.
        </p>
        <input
          value={program.boardTitle ?? ''}
          placeholder="Board title (e.g. TONIGHT)"
          onChange={(e) => setProgram((p) => ({ ...p, boardTitle: e.target.value }))}
          onBlur={(e) => save({ boardTitle: e.target.value }, { boardTitle: e.target.value.trim() || null })}
          className={`${inputClass} w-full max-w-sm mb-3`}
        />
        <ScheduleEditor
          rows={boardRows}
          bandNames={bandNames}
          onChange={(rows) => save({ boardRows: rows }, { boardRows: rows })}
        />
      </section>
    </div>
  );
}
