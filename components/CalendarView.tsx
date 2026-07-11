'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Show } from '@/lib/shows';

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
}: {
  shows: Show[];
  today: string;
  draftShows?: Show[];
  availableDates?: string[];
  isAdmin?: boolean;
}) {
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

  const showsByDay = new Map<number, Show>();
  for (const show of shows) {
    const date = parseLocalDate(show.date);
    if (date.getFullYear() === cursor.year && date.getMonth() === cursor.month) {
      showsByDay.set(date.getDate(), show);
    }
  }

  const draftShowsByDay = new Map<number, Show>();
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
    <div className="max-w-md rounded-lg border border-[#E8E0D0]/20 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
          className="rounded p-1.5 text-[#E8E0D0]/60 transition-colors hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
        >
          ←
        </button>
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
        <button
          onClick={() => goToMonth(1)}
          aria-label="Next month"
          className="rounded p-1.5 text-[#E8E0D0]/60 transition-colors hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
        >
          →
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-[#E8E0D0]/40">
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
                  className="group relative flex aspect-square items-center justify-center overflow-hidden rounded border border-dashed border-yellow-500/50 transition-all hover:border-yellow-400"
                >
                  {draftShow.flyer ? (
                    <img
                      src={draftShow.flyer}
                      alt={`${draftShow.title} flyer`}
                      className="h-full w-full object-cover opacity-60"
                    />
                  ) : (
                    <div className="h-full w-full bg-yellow-500/10" />
                  )}
                  <span className="absolute left-1 top-0.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
                    {day}
                    {isToday(day) && <span className="h-1 w-1 rounded-full bg-yellow-300" />}
                  </span>
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-yellow-500 px-1 text-[8px] font-bold uppercase tracking-wide text-black">
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
                  className="relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded border border-dotted border-green-500/40 text-sm text-[#E8E0D0]/40 transition-all hover:border-green-400 hover:text-[#E8E0D0]"
                >
                  {day}
                  {isToday(day) && <span className="h-1 w-1 rounded-full bg-yellow-400" />}
                  <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                </Link>
              );
            }

            return (
              <div
                key={day}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 text-sm ${
                  isToday(day) ? 'text-[#E8E0D0]' : 'text-[#E8E0D0]/30'
                }`}
              >
                {day}
                {isToday(day) && <span className="h-1 w-1 rounded-full bg-yellow-400" />}
              </div>
            );
          }

          const isPast = show.date < today;

          return (
            <Link
              key={day}
              href={`/shows/${show.slug}`}
              title={show.title}
              className={`group relative aspect-square overflow-hidden rounded border transition-all ${
                isPast
                  ? 'border-[#E8E0D0]/10 opacity-40 grayscale hover:opacity-90 hover:grayscale-0'
                  : 'border-[#E8E0D0]/30 hover:border-yellow-400'
              }`}
            >
              {show.flyer ? (
                <img
                  src={show.flyer}
                  alt={`${show.title} flyer`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[#E8E0D0]/10" />
              )}
              <span className="absolute left-1 top-0.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
                {day}
                {isToday(day) && <span className="h-1 w-1 rounded-full bg-yellow-300" />}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
