'use client';

import { useMemo, useState } from 'react';
import ShowsList, { type ShowListItem } from './ShowsList';
import ShowHealthPanel from './ShowHealthPanel';
import CalendarView from '@/components/CalendarView';

// Same List/Calendar toggle as the public upcoming-shows page's ShowsBrowser,
// but List stays the existing management table (search/edit/delete) rather
// than switching to show cards, and every calendar cell — announced or draft —
// links to the admin edit page instead of the public show page.
export default function AdminShowsBrowser({
  initialShows,
  today,
}: {
  initialShows: ShowListItem[];
  today: string;
}) {
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const { announcedShows, draftShows } = useMemo(() => {
    const announced: ShowListItem[] = [];
    const drafts: ShowListItem[] = [];
    for (const show of initialShows) {
      (show.announced ? announced : drafts).push(show);
    }
    return { announcedShows: announced, draftShows: drafts };
  }, [initialShows]);

  return (
    <div>
      <ShowHealthPanel shows={initialShows} today={today} />
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
        <ShowsList initialShows={initialShows} />
      ) : (
        <CalendarView
          shows={announcedShows}
          draftShows={draftShows}
          today={today}
          isAdmin
          showHref={(show) => `/admin/shows/${show.id}`}
        />
      )}
    </div>
  );
}
