'use client';

import { useMemo, useState } from 'react';
import ShowsList, { type ShowListItem } from './ShowsList';
import CalendarView from '@/components/CalendarView';
import { PageHeader, buttonClassName } from './ui';

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
      <PageHeader overline="Shows" title="Shows" />
      <div className="mb-6 flex gap-2">
        {(['list', 'calendar'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className={`${buttonClassName(view === option ? 'primary' : 'secondary', 's')} uppercase`}
          >
            {option}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <ShowsList initialShows={initialShows} today={today} />
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
