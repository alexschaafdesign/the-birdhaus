'use client';

import { useState } from 'react';
import { DATE_OFFER_COLORS } from '@/lib/date-offers';
import type { DayInfo } from './BookingDashboard';

// Forked from components/CalendarView.tsx: same month-grid math, but built
// for planning — every cell is a select-the-day button (no navigation links,
// no flyer images), the header adds ±year jumps, and cells layer booking
// state (day titles, notepads, submission offers) over the show/available base.

// First month of the season being booked; bump when planning moves on.
const PLANNING_SEASON_START = '2027-01-01';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function BookingCalendar({
  dayInfoByDate,
  today,
  selectedDate,
  onSelectDate,
  paintMode,
  onPaintDay,
}: {
  dayInfoByDate: Map<string, DayInfo>;
  today: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  // Paint mode: clicking a day toggles availability directly instead of
  // opening the day panel — the fast path for blocking out a season.
  paintMode: boolean;
  onPaintDay: (date: string) => void;
}) {
  const todayDate = parseLocalDate(today);
  // Opens on the season being planned (or today, once that's in the past);
  // the Today button still jumps to the current month.
  const [cursor, setCursor] = useState(() =>
    today < PLANNING_SEASON_START
      ? { year: Number(PLANNING_SEASON_START.slice(0, 4)), month: Number(PLANNING_SEASON_START.slice(5, 7)) - 1 }
      : { year: todayDate.getFullYear(), month: todayDate.getMonth() }
  );

  const goToMonth = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const isCurrentMonth =
    cursor.year === todayDate.getFullYear() && cursor.month === todayDate.getMonth();

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstOfMonth.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const navButtonClass =
    'rounded p-1.5 text-[#E8E0D0]/60 transition-colors hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]';

  return (
    <div className="rounded-lg border border-[#E8E0D0]/20 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => goToMonth(-12)} aria-label="Previous year" className={navButtonClass}>
            «
          </button>
          <button onClick={() => goToMonth(-1)} aria-label="Previous month" className={navButtonClass}>
            ←
          </button>
        </div>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">
            {firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          {!isCurrentMonth && (
            <button
              onClick={() =>
                setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() })
              }
              className="font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => goToMonth(1)} aria-label="Next month" className={navButtonClass}>
            →
          </button>
          <button onClick={() => goToMonth(12)} aria-label="Next year" className={navButtonClass}>
            »
          </button>
        </div>
      </div>

      {paintMode && (
        <p className="mb-3 rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400">
          Availability mode — click days to mark or unmark them as available.
        </p>
      )}

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-[#E8E0D0]/40">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const info = dayInfoByDate.get(dateStr);
          const show = info?.show;
          const draft = info?.draftShow;
          const titled = show ?? draft;
          // No show on the day → the day's own title is the cell's label
          // ("Fresh Cuts?", "Comedy show?").
          const dayTitle = !titled ? info?.plan?.title || undefined : undefined;
          const hasNotepad = Boolean(info?.plan?.notepad.trim());
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;

          const base = show
            ? 'border border-[#E8E0D0]/40 bg-[#E8E0D0]/10'
            : draft
              ? 'border border-dashed border-yellow-500/50 bg-yellow-500/10'
              : info?.available
                ? 'border border-dotted border-green-500/40'
                : 'border border-transparent';

          return (
            <button
              key={day}
              onClick={() => {
                // Paint mode toggles availability directly; days already
                // carrying a show still open the panel instead.
                if (paintMode && !titled) onPaintDay(dateStr);
                else onSelectDate(dateStr);
              }}
              title={titled ? `${titled.title}${draft && !show ? ' (draft)' : ''}` : dayTitle ?? dateStr}
              className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded text-sm transition-all ${
                paintMode && !titled ? 'hover:border-green-400' : 'hover:border-[#E8E0D0]/60'
              } ${base} ${
                isSelected ? 'ring-2 ring-yellow-400' : ''
              } ${titled ? 'text-[#E8E0D0]/80' : isToday ? 'text-[#E8E0D0]' : 'text-[#E8E0D0]/40'}`}
            >
              <span className="absolute left-1 top-0.5 flex items-center gap-1 text-[10px] font-bold">
                {day}
                {isToday && <span className="h-1 w-1 rounded-full bg-yellow-400" />}
              </span>

              {titled && (
                <span className="mt-3 line-clamp-3 break-words px-1 text-center text-[9px] font-medium leading-tight sm:text-xs">
                  {titled.title}
                </span>
              )}
              {dayTitle && (
                <span className="mt-3 line-clamp-3 break-words px-1 text-center text-[9px] font-medium leading-tight text-[#E8E0D0]/90 sm:text-xs">
                  {dayTitle}
                </span>
              )}

              <span className="absolute bottom-0.5 left-1 flex items-center gap-0.5">
                {hasNotepad && <span className="h-1.5 w-1.5 rounded-full bg-[#E8E0D0]/50" title="Has notes" />}
                {info?.offers.slice(0, 2).map((offer) => (
                  <span
                    key={offer.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: DATE_OFFER_COLORS[offer.status] }}
                    title={`Offered to ${offer.band_name} (${offer.status})`}
                  />
                ))}
              </span>

              {info?.available && !titled && (
                <span className="absolute bottom-0.5 right-1 h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#E8E0D0]/40">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-[#E8E0D0]/40 bg-[#E8E0D0]/10" /> show
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-dashed border-yellow-500/50 bg-yellow-500/10" /> draft
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-dotted border-green-500/40" /> available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E8E0D0]/50" /> notes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DATE_OFFER_COLORS.contacted }} /> offered (submissions)
        </span>
      </div>
    </div>
  );
}
