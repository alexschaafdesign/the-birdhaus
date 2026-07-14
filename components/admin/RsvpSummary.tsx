import type { RsvpSummary as RsvpSummaryData } from '@/lib/rsvps';

function formatSubmittedAt(createdAt: string): string {
  return new Date(createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function RsvpSummary({ rsvps, totalCount, totalGuests }: RsvpSummaryData) {
  return (
    <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80">RSVPs</h2>
        <span className="text-xs text-[#E8E0D0]/50">
          {totalCount} RSVP{totalCount === 1 ? '' : 's'} · {totalGuests} guest{totalGuests === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-2">
        {rsvps.map((rsvp) => (
          <div
            key={rsvp.id}
            className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold truncate">{rsvp.name}</span>
                <span className="text-sm text-[#E8E0D0]/50 truncate">{rsvp.email}</span>
                {rsvp.email_list_opt_in && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-green-400/40 text-green-300">
                    Email list
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-sm text-[#E8E0D0]/50">
              <span>
                {rsvp.guests} guest{rsvp.guests === 1 ? '' : 's'}
              </span>
              <span className="font-mono text-xs">{formatSubmittedAt(rsvp.created_at)}</span>
            </div>
          </div>
        ))}
        {rsvps.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No RSVPs yet.</p>
        )}
      </div>
    </div>
  );
}
