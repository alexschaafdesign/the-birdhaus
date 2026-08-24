'use client';

import { useState } from 'react';
import ShowForm from './ShowForm';
import SongClubEventForm from './SongClubEventForm';

// One "add an event" entry with a type toggle. A Show and a Song Club event are
// still two separate records with two separate forms + write paths (a show
// carries a lineup, ticketing, settlements…; a Song Club event doesn't) — this
// is a UI veneer that routes to the right one, so both are added from one place.
export default function NewEventForm({
  initialDate,
  initialType = 'show',
  rounds,
}: {
  initialDate?: string;
  initialType?: 'show' | 'song_club';
  rounds: Array<{ id: number; title: string }>;
}) {
  const [type, setType] = useState<'show' | 'song_club'>(initialType);

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
          Event type
        </div>
        <div className="inline-flex rounded-lg border border-[#E8E0D0]/20 p-1">
          {([
            ['show', 'Show'],
            ['song_club', 'Song Club'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                type === value
                  ? 'bg-[#E8E0D0] text-[#2A2420]'
                  : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {type === 'show' ? (
        <ShowForm mode="create" initialValues={initialDate ? { date: initialDate } : undefined} />
      ) : (
        <SongClubEventForm mode="add" rounds={rounds} />
      )}
    </div>
  );
}
