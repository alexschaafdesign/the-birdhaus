'use client';

import { useState } from 'react';
import { DATE_OFFER_SWATCH } from '@/lib/date-offers';
import { ADMIN_TYPE } from '@/components/admin/ui';
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
    ' p-1.5 text-surface-ink/60 transition-colors hover:bg-surface-paper-shade hover:text-accent-red';

  return (
    <div className="border border-surface-ink p-4 sm:p-6">
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
          <h3 className="text-header-4 font-bold">
            {firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          {!isCurrentMonth && (
            <button
              onClick={() =>
                setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() })
              }
              className={`text-data-caption-13 uppercase ${ADMIN_TYPE.link}`}
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
        <p className="mb-3  border border-surface-ink bg-surface-paper-shade px-3 py-1.5 text-data-caption-13 text-surface-ink">
          Availability mode — click days to mark or unmark them as available.
        </p>
      )}

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-data-caption-13 text-surface-ink/60">
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
          const unavailable = Boolean(info?.plan?.unavailable);
          // Paint mode only toggles open days; shows and conflicts open the panel.
          const paintable = paintMode && !titled && !unavailable;

          const base = show
            ? 'border border-surface-ink bg-surface-paper-shade'
            : draft
              ? 'border border-dashed border-surface-ink bg-spectrum-amber/40'
              : unavailable
                ? 'border border-accent-red bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--color-accent-red)_15%,transparent)_0_4px,transparent_4px_9px)]'
                : info?.available
                ? 'border border-dotted border-surface-ink'
                : 'border border-transparent';

          return (
            <button
              key={day}
              onClick={() => {
                // Paint mode toggles availability directly; days already
                // carrying a show (or marked not available) open the panel.
                if (paintable) onPaintDay(dateStr);
                else onSelectDate(dateStr);
              }}
              title={`${titled ? `${titled.title}${draft && !show ? ' (draft)' : ''}` : dayTitle ?? dateStr}${unavailable ? ' — not available' : ''}`}
              className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden  text-body-3 transition-all ${
                paintable ? 'hover:border-surface-ink' : 'hover:border-accent-red'
              } ${base} ${
                isSelected ? 'ring-2 ring-accent-red' : ''
              } ${titled ? 'text-surface-ink/80' : isToday ? 'text-surface-ink' : 'text-surface-ink/60'}`}
            >
              <span className="absolute left-1 top-0.5 flex items-center gap-1 text-data-label-10-small font-bold">
                {day}
                {isToday && <span className="h-1 w-1  bg-accent-red" />}
              </span>

              {titled && (
                <span className="mt-3 line-clamp-3 break-words px-1 text-center text-data-label-10-small font-bold leading-tight sm:text-data-caption-13">
                  {titled.title}
                </span>
              )}
              {dayTitle && (
                <span className="mt-3 line-clamp-3 break-words px-1 text-center text-data-label-10-small font-bold leading-tight text-surface-ink/80 sm:text-data-caption-13">
                  {dayTitle}
                </span>
              )}
              {unavailable && !titled && !dayTitle && (
                <span className="mt-3 px-1 text-center text-data-label-10-small font-bold uppercase leading-tight text-accent-red sm:text-data-label-10-small">
                  Not avail.
                </span>
              )}

              <span className="absolute bottom-0.5 left-1 flex items-center gap-0.5">
                {hasNotepad && <span className="h-1.5 w-1.5  bg-surface-ink/50" title="Has notes" />}
                {info?.offers.slice(0, 2).map((offer) => (
                  <span
                    key={offer.id}
                    className={`h-1.5 w-1.5 ${DATE_OFFER_SWATCH[offer.status]}`}
                    title={`Offered to ${offer.band_name} (${offer.status})`}
                  />
                ))}
              </span>

              {unavailable && (
                <span className="absolute right-1 top-0.5 text-data-label-10-small font-bold leading-none text-accent-red" aria-hidden>
                  ✕
                </span>
              )}
              {info?.available && !titled && (
                <span className="absolute bottom-0.5 right-1 h-1.5 w-1.5  bg-surface-ink" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-data-label-10-small text-surface-ink/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3  border border-surface-ink bg-surface-paper-shade" /> show
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3  border border-dashed border-surface-ink bg-spectrum-amber/40" /> draft
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3  border border-dotted border-surface-ink" /> available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3  border border-accent-red " /> not available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 bg-surface-ink/50" /> notes
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 ${DATE_OFFER_SWATCH.contacted}`} /> offered (submissions)
        </span>
      </div>
    </div>
  );
}
