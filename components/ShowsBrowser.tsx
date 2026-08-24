'use client';

import { useState } from 'react';
import type { Show } from '@/lib/shows';
import ShowCard from './ShowCard';
import AvailableDateCard from './AvailableDateCard';
import CalendarView from './CalendarView';

type ListEntry =
  | { kind: 'show'; date: string; show: Show }
  | { kind: 'draft'; date: string; show: Show }
  | { kind: 'available'; date: string };

export default function ShowsBrowser({
  upcomingShows,
  calendarShows,
  today,
  draftShows,
  availableDates,
  isAdmin,
  onDark,
}: {
  upcomingShows: Show[];
  calendarShows: Show[];
  today: string;
  draftShows?: Show[];
  availableDates?: string[];
  isAdmin?: boolean;
  // The home page renders over the dark full-page photo background.
  onDark?: boolean;
}) {
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const hasAdminExtras = isAdmin && ((draftShows?.length ?? 0) > 0 || (availableDates?.length ?? 0) > 0);

  if (upcomingShows.length === 0 && calendarShows.length === 0 && !hasAdminExtras) {
    return <p className={onDark ? 'text-paper/70' : 'text-ink/60'}>No upcoming shows scheduled.</p>;
  }

  // Admin sees draft shows and open available dates woven into the same
  // chronological list, not just the calendar.
  const listEntries: ListEntry[] = isAdmin
    ? [
        ...upcomingShows.map((show) => ({ kind: 'show' as const, date: show.date, show })),
        ...(draftShows ?? []).map((show) => ({ kind: 'draft' as const, date: show.date, show })),
        ...(availableDates ?? []).map((date) => ({ kind: 'available' as const, date })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : upcomingShows.map((show) => ({ kind: 'show' as const, date: show.date, show }));

  return (
    <div>
      <div className="mb-6 flex gap-2">
        {(['list', 'calendar'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            className={`border-2 px-3 py-1.5 font-mono text-sm uppercase tracking-widest transition-colors ${
              view === option
                ? onDark
                  ? 'border-paper bg-paper text-ink'
                  : 'border-ink bg-ink text-paper'
                : onDark
                  ? 'border-paper/30 text-paper/60 hover:border-paper hover:text-paper'
                  : 'border-ink/30 text-ink/50 hover:border-ink hover:text-ink'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        listEntries.length === 0 ? (
          <p className={onDark ? 'text-paper/70' : 'text-ink/60'}>No upcoming shows scheduled.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listEntries.map((entry) =>
              entry.kind === 'show' ? (
                <ShowCard key={`show-${entry.show.slug}`} show={entry.show} />
              ) : entry.kind === 'draft' ? (
                <ShowCard key={`draft-${entry.show.id}`} show={entry.show} draft />
              ) : (
                <AvailableDateCard key={`available-${entry.date}`} date={entry.date} />
              )
            )}
          </div>
        )
      ) : (
        <CalendarView
          shows={calendarShows}
          today={today}
          draftShows={draftShows}
          availableDates={availableDates}
          isAdmin={isAdmin}
          dark={onDark}
        />
      )}
    </div>
  );
}
