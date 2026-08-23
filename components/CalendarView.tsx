'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// Deliberately narrower than lib/shows.ts's full Show — this is all any caller
// (public upcoming-shows page, admin shows page) has needed to render a cell.
// A full Show satisfies this structurally, so existing callers pass Show[] as-is.
export interface CalendarShow {
  id: number;
  slug: string;
  title: string;
  date: string;
  flyer?: string | null;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function CalendarView({
  shows,
  today,
  draftShows,
  availableDates,
  isAdmin,
  showHref = (show) => `/shows/${show.slug}`,
  dark,
}: {
  shows: CalendarShow[];
  today: string;
  draftShows?: CalendarShow[];
  availableDates?: string[];
  isAdmin?: boolean;
  // Overridable so a management view (e.g. admin shows page) can point every
  // cell at the edit page instead of the public show page.
  showHref?: (show: CalendarShow) => string;
  // The admin dashboard still uses the old dark shell; public pages get the
  // light paper/ink styling.
  dark?: boolean;
}) {
  const c = dark
    ? {
        frame: 'rounded-lg border border-[#E8E0D0]/20',
        navBtn: 'rounded p-1.5 text-[#E8E0D0]/60 transition-colors hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]',
        todayBtn: 'font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50 hover:text-[#E8E0D0]',
        weekdays: 'text-[#E8E0D0]/40',
        emptyDay: 'text-[#E8E0D0]/30',
        todayText: 'text-[#E8E0D0]',
        todayDot: 'bg-yellow-400',
        showCell: 'rounded border-[#E8E0D0]/30 hover:border-yellow-400',
        pastCell: 'rounded border-[#E8E0D0]/10 opacity-40 grayscale hover:opacity-90 hover:grayscale-0',
        cellFill: 'bg-[#E8E0D0]/10',
        draftCell: 'rounded border-dashed border-yellow-500/50 hover:border-yellow-400',
        draftFill: 'bg-yellow-500/10',
        draftChip: 'rounded bg-yellow-500 text-black',
        availCell: 'rounded border-dotted border-green-500/40 text-[#E8E0D0]/40 hover:border-green-400 hover:text-[#E8E0D0]',
        availDot: 'bg-green-500',
      }
    : {
        frame: 'border-2 border-ink',
        navBtn: 'p-1.5 text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink',
        todayBtn: 'font-mono text-xs uppercase tracking-widest text-ink/50 hover:text-ink',
        weekdays: 'font-mono text-ink/40',
        emptyDay: 'text-ink/30',
        todayText: 'text-ink font-bold',
        todayDot: 'bg-vhs-red',
        showCell: 'border-ink/40 hover:border-vhs-red',
        pastCell: 'border-ink/15 opacity-40 grayscale hover:opacity-90 hover:grayscale-0',
        cellFill: 'bg-ink/10',
        draftCell: 'border-dashed border-ink/50 hover:border-ink',
        draftFill: 'bg-ink/5',
        draftChip: 'bg-ink text-paper',
        availCell: 'border-dotted border-vhs-green/50 text-ink/40 hover:border-vhs-green hover:text-ink',
        availDot: 'bg-vhs-green',
      };
  const todayDate = parseLocalDate(today);
  const [cursor, setCursor] = useState({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(),
  });

  const goToMonth = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const isCurrentMonth =
    cursor.year === todayDate.getFullYear() && cursor.month === todayDate.getMonth();

  const showsByDay = new Map<number, CalendarShow>();
  for (const show of shows) {
    const date = parseLocalDate(show.date);
    if (date.getFullYear() === cursor.year && date.getMonth() === cursor.month) {
      showsByDay.set(date.getDate(), show);
    }
  }

  const draftShowsByDay = new Map<number, CalendarShow>();
  if (isAdmin && draftShows) {
    for (const show of draftShows) {
      const date = parseLocalDate(show.date);
      if (date.getFullYear() === cursor.year && date.getMonth() === cursor.month) {
        draftShowsByDay.set(date.getDate(), show);
      }
    }
  }

  const availableDaysSet = new Set<number>();
  if (isAdmin && availableDates) {
    for (const dateStr of availableDates) {
      const date = parseLocalDate(dateStr);
      if (date.getFullYear() === cursor.year && date.getMonth() === cursor.month) {
        availableDaysSet.add(date.getDate());
      }
    }
  }

  const isToday = (day: number) => isCurrentMonth && day === todayDate.getDate();

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstOfMonth.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className={`max-w-md p-4 sm:p-6 ${c.frame}`}>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
          className={c.navBtn}
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold">
            {firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          {!isCurrentMonth && (
            <button
              onClick={() =>
                setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() })
              }
              className={c.todayBtn}
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => goToMonth(1)}
          aria-label="Next month"
          className={c.navBtn}
        >
          →
        </button>
      </div>

      <div className={`mb-1 grid grid-cols-7 gap-1 text-center text-xs ${c.weekdays}`}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const show = showsByDay.get(day);
          if (!show) {
            const draftShow = draftShowsByDay.get(day);
            if (draftShow) {
              return (
                <Link
                  key={day}
                  href={`/admin/shows/${draftShow.id}`}
                  title={`${draftShow.title} (draft)`}
                  className={`group relative flex aspect-square items-center justify-center overflow-hidden border transition-all ${c.draftCell}`}
                >
                  {draftShow.flyer ? (
                    <Image
                      src={draftShow.flyer}
                      alt={`${draftShow.title} flyer`}
                      fill
                      sizes="(max-width: 768px) 14vw, 90px"
                      unoptimized
                      className="object-cover opacity-60"
                    />
                  ) : (
                    <div className={`h-full w-full ${c.draftFill}`} />
                  )}
                  <span className="absolute left-1 top-0.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
                    {day}
                    {isToday(day) && <span className={`h-1 w-1 rounded-full ${c.todayDot}`} />}
                  </span>
                  <span className={`absolute bottom-0.5 right-0.5 px-1 text-[8px] font-bold uppercase tracking-wide ${c.draftChip}`}>
                    Draft
                  </span>
                </Link>
              );
            }

            if (availableDaysSet.has(day)) {
              const dateStr = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return (
                <Link
                  key={day}
                  href={`/admin/shows/new?date=${dateStr}`}
                  title="Available date — click to draft a show"
                  className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 border text-sm transition-all ${c.availCell}`}
                >
                  {day}
                  {isToday(day) && <span className={`h-1 w-1 rounded-full ${c.todayDot}`} />}
                  <span className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ${c.availDot}`} />
                </Link>
              );
            }

            return (
              <div
                key={day}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 text-sm ${
                  isToday(day) ? c.todayText : c.emptyDay
                }`}
              >
                {day}
                {isToday(day) && <span className={`h-1 w-1 rounded-full ${c.todayDot}`} />}
              </div>
            );
          }

          const isPast = show.date < today;

          return (
            <Link
              key={day}
              href={showHref(show)}
              title={show.title}
              className={`group relative aspect-square overflow-hidden border transition-all ${
                isPast ? c.pastCell : c.showCell
              }`}
            >
              {show.flyer ? (
                <Image
                  src={show.flyer}
                  alt={`${show.title} flyer`}
                  fill
                  sizes="(max-width: 768px) 14vw, 90px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className={`h-full w-full ${c.cellFill}`} />
              )}
              <span className="absolute left-1 top-0.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
                {day}
                {isToday(day) && <span className={`h-1 w-1 rounded-full ${c.todayDot}`} />}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
