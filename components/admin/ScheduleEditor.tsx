'use client';

import type { ScheduleRow } from '@/lib/advance';

// Structured schedule editing (admin-only), extracted from the old Advance
// panel so the hub's inline editor can reuse it. The stored value stays a plain
// string per row (e.g. "7:30pm", "8–8:30pm") so the render paths and legacy
// drafts are unchanged — this just drives it with dropdowns. PM is assumed (no
// AM control; we've never had an AM schedule), so the string always carries a
// "pm" suffix. An optional end time turns a single time into a range.

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

const timeSelectClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-1 py-1 text-sm focus:outline-none focus:border-[#E8E0D0] [&>option]:bg-[#2A2420]';

interface ParsedTime {
  startH: number | null;
  startM: number;
  endH: number | null;
  endM: number;
}

const EMPTY_TIME: ParsedTime = { startH: null, startM: 0, endH: null, endM: 0 };

// Parse a stored time string ("7:30pm", "8–8:30", "5:30 pm") into structured
// fields. Meridiem text is ignored (PM assumed). Anything unparseable → empty.
function parseTime(value: string): ParsedTime {
  // Strip meridiem (no \b — "pm" sits against a digit, e.g. "8pm", so a word
  // boundary never matches there) and all whitespace.
  const cleaned = value.toLowerCase().replace(/am|pm/g, '').replace(/\s+/g, '');
  if (!cleaned) return EMPTY_TIME;
  const parts = cleaned.split(/–|—|-|to/);
  const parsePart = (p: string): { h: number; m: number } | null => {
    const m = p.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    return { h, m: min };
  };
  const start = parsePart(parts[0] ?? '');
  if (!start) return EMPTY_TIME;
  const end = parts[1] ? parsePart(parts[1]) : null;
  return { startH: start.h, startM: start.m, endH: end ? end.h : null, endM: end ? end.m : 0 };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Format structured fields back to the stored string. On-the-hour times drop
// ":00" ("8" not "8:00"), matching how these usually read; "pm" is appended.
function formatTime(t: ParsedTime): string {
  if (t.startH === null) return '';
  const part = (h: number, m: number) => (m ? `${h}:${pad2(m)}` : `${h}`);
  let s = part(t.startH, t.startM);
  if (t.endH !== null) s += `–${part(t.endH, t.endM)}`;
  return `${s}pm`;
}

function TimeSelects({
  hour,
  minute,
  allowEmpty,
  onHour,
  onMinute,
}: {
  hour: number | null;
  minute: number;
  allowEmpty: boolean;
  onHour: (h: number | null) => void;
  onMinute: (m: number) => void;
}) {
  // Keep an off-grid minute (e.g. a legacy "8:20" — actually on-grid, but guard
  // anyway) selectable rather than silently dropping to the first option.
  const minuteOptions = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);
  return (
    <span className="inline-flex items-center">
      <select
        value={hour ?? ''}
        onChange={(e) => onHour(e.target.value === '' ? null : Number(e.target.value))}
        className={timeSelectClass}
        aria-label="Hour"
      >
        {allowEmpty && <option value="">–</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-[#E8E0D0]/30 px-0.5">:</span>
      <select
        value={minute}
        onChange={(e) => onMinute(Number(e.target.value))}
        disabled={hour === null}
        className={`${timeSelectClass} disabled:opacity-40`}
        aria-label="Minute"
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {pad2(m)}
          </option>
        ))}
      </select>
    </span>
  );
}

function TimeField({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const t = parseTime(value);
  const emit = (next: Partial<ParsedTime>) => onChange(formatTime({ ...t, ...next }));

  return (
    <div className="flex items-center gap-1 shrink-0">
      <TimeSelects
        hour={t.startH}
        minute={t.startM}
        allowEmpty
        // Clearing the start hour clears the whole time (and any range).
        onHour={(h) => (h === null ? onChange('') : emit({ startH: h }))}
        onMinute={(m) => emit({ startM: m })}
      />
      {t.endH !== null ? (
        <>
          <span className="text-[#E8E0D0]/30 text-xs">–</span>
          <TimeSelects
            hour={t.endH}
            minute={t.endM}
            allowEmpty={false}
            onHour={(h) => emit({ endH: h })}
            onMinute={(m) => emit({ endM: m })}
          />
          <button
            type="button"
            onClick={() => emit({ endH: null, endM: 0 })}
            className="text-[#E8E0D0]/40 hover:text-red-300 text-xs px-0.5"
            aria-label="Remove end time"
          >
            ✕
          </button>
        </>
      ) : (
        t.startH !== null && (
          <button
            type="button"
            onClick={() => emit({ endH: t.startH, endM: t.startM })}
            className="text-xs text-[#E8E0D0]/40 hover:text-[#E8E0D0] whitespace-nowrap"
          >
            +range
          </button>
        )
      )}
      <span className="text-[10px] text-[#E8E0D0]/30">pm</span>
    </div>
  );
}

// Default schedule template, derived so it reproduces the standard Birdhaus
// timing exactly for a 3-band show and scales for any lineup size:
//   4:00pm  sound engineer arrives / load-in
//   4:30pm  soundchecks, 1 hr apart, in REVERSE set order (headliner first)
//   +30min  doors, after the last soundcheck
//   +1hr    first set after doors; 35-min sets with 15-min changeovers
//   +45min  house clear, after the last set
// All PM. Uses formatTime so the strings round-trip through the time picker.
function buildScheduleTemplate(bandNames: string[]): ScheduleRow[] {
  const clean = bandNames.map((n) => n.trim()).filter(Boolean);
  const n = clean.length;

  // Minutes-from-midnight → the picker's PM parts (hour 1–12, minute).
  const parts = (min: number) => {
    const h24 = Math.floor(min / 60);
    return { h: h24 > 12 ? h24 - 12 : h24, m: min % 60 };
  };
  const at = (min: number) => {
    const { h, m } = parts(min);
    return formatTime({ startH: h, startM: m, endH: null, endM: 0 });
  };
  const range = (start: number, end: number) => {
    const a = parts(start);
    const b = parts(end);
    return formatTime({ startH: a.h, startM: a.m, endH: b.h, endM: b.m });
  };

  const rows: ScheduleRow[] = [];
  rows.push({ time: at(16 * 60), label: 'Sound engineer arrives — bands can start loading in' });

  // Soundchecks in reverse set order (headliner first), 1 hr apart from 4:30pm.
  const scStart = 16 * 60 + 30;
  [...clean].reverse().forEach((name, i) => {
    rows.push({ time: at(scStart + i * 60), label: `${name} soundcheck` });
  });

  const doors = scStart + Math.max(n - 1, 0) * 60 + 30; // 30 min after last soundcheck
  rows.push({ time: at(doors), label: 'Doors' });

  // Sets in set order from doors + 1 hr: 35-min sets, 15-min changeovers.
  const setStart = doors + 60;
  const setStep = 50; // 35-min set + 15-min changeover
  clean.forEach((name, i) => {
    const s = setStart + i * setStep;
    rows.push({ time: range(s, s + 35), label: name });
  });

  const lastSetEnd = setStart + Math.max(n - 1, 0) * setStep + 35;
  rows.push({ time: at(lastSetEnd + 45), label: 'House clear' });

  return rows;
}

// Structured schedule: an ordered list of {time, label} rows. "Prefill from
// lineup" scaffolds the standard show timing (see buildScheduleTemplate) —
// load-in, soundchecks, doors, sets, and house clear, with times filled in.
export default function ScheduleEditor({
  rows,
  bandNames,
  onChange,
}: {
  rows: ScheduleRow[];
  bandNames: string[];
  onChange: (rows: ScheduleRow[]) => void;
}) {
  function update(i: number, patch: Partial<ScheduleRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rows, { time: '', label: '' }]);
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function prefill() {
    const hasContent = rows.some((r) => r.time.trim() || r.label.trim());
    if (hasContent && !confirm('Replace the current schedule with a lineup template?')) return;
    onChange(buildScheduleTemplate(bandNames));
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <TimeField value={row.time} onChange={(t) => update(i, { time: t })} />
              <span className="text-[#E8E0D0]/30 text-sm shrink-0">—</span>
              <input
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="what's happening"
                className={`${inputClass} flex-1 min-w-[8rem]`}
                aria-label="Description"
              />
              <div className="flex items-center shrink-0 text-[#E8E0D0]/40">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="px-1 hover:text-[#E8E0D0] disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  className="px-1 hover:text-[#E8E0D0] disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-1 hover:text-red-300"
                  aria-label="Remove row"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] border border-[#E8E0D0]/25 rounded px-3 py-1.5 transition-colors"
        >
          + Add row
        </button>
        {bandNames.length > 0 && (
          <button
            type="button"
            onClick={prefill}
            className="text-xs text-[#E8E0D0]/45 hover:text-[#E8E0D0] underline"
          >
            Prefill from lineup
          </button>
        )}
      </div>
    </div>
  );
}
