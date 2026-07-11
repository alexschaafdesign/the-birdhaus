'use client';

import { useState } from 'react';
import type { Show } from '@/lib/shows';
import ShowCard from './ShowCard';
import CalendarView from './CalendarView';

export default function ShowsBrowser({
  upcomingShows,
  calendarShows,
  today,
}: {
  upcomingShows: Show[];
  calendarShows: Show[];
  today: string;
}) {
  const [view, setView] = useState<'list' | 'calendar'>('list');

  if (upcomingShows.length === 0 && calendarShows.length === 0) {
    return <p className="text-[#E8E0D0]/70">No upcoming shows scheduled.</p>;
  }

  return (
    <div>
      <div className="mb-6 flex gap-2">
        {(['list', 'calendar'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            className={`rounded px-3 py-1.5 font-mono text-sm uppercase tracking-widest transition-colors ${
              view === option
                ? 'bg-[#E8E0D0] text-[#171412]'
                : 'border border-[#E8E0D0]/30 text-[#E8E0D0]/60 hover:text-[#E8E0D0]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        upcomingShows.length === 0 ? (
          <p className="text-[#E8E0D0]/70">No upcoming shows scheduled.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingShows.map((show) => (
              <ShowCard key={show.slug} show={show} />
            ))}
          </div>
        )
      ) : (
        <CalendarView shows={calendarShows} today={today} />
      )}
    </div>
  );
}
