'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface ShowListItem {
  id: number;
  slug: string;
  title: string;
  date: string;
  announced: boolean;
  flyer?: string | null;
  sound_engineer_name?: string | null;
  rsvp_form?: boolean;
  band_count?: number;
  target_band_count?: number;
  ignored_health_checks?: string[];
  rsvp_count?: number;
  guest_count?: number;
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function ShowsList({ initialShows }: { initialShows: ShowListItem[] }) {
  const [shows, setShows] = useState<ShowListItem[]>(initialShows);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shows;
    return shows.filter(
      (s) => s.title.toLowerCase().includes(q) || s.date.includes(q) || s.slug.includes(q)
    );
  }, [shows, search]);

  const { upcoming, past } = useMemo(() => {
    // Local YYYY-MM-DD; dates are date-only strings so string comparison is safe.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const upcoming = filtered
      .filter((s) => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)); // next show first
    const past = filtered
      .filter((s) => s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date)); // most recent first
    return { upcoming, past };
  }, [filtered]);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setShows((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/admin/shows/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setErrorMessage('Failed to delete — refresh and try again.');
    }
  }

  return (
    <div>
      {errorMessage && (
        <div className="mb-4 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="text"
          placeholder="Search title, date, slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} w-full max-w-sm`}
        />
        <Link
          href="/admin/shows/new"
          className="ml-auto border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
        >
          + New show
        </Link>
      </div>

      <p className="text-xs text-[#E8E0D0]/40 mb-3">
        {filtered.length} of {shows.length} shows shown
      </p>

      {filtered.length === 0 ? (
        <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No shows match this search.</p>
      ) : (
        <div className="space-y-8">
          <ShowGroup title="Upcoming Shows" shows={upcoming} onDelete={handleDelete} showIssueBadges />
          <ShowGroup title="Past Shows" shows={past} onDelete={handleDelete} />
        </div>
      )}
    </div>
  );
}

function ShowGroup({
  title,
  shows,
  onDelete,
  showIssueBadges,
}: {
  title: string;
  shows: ShowListItem[];
  onDelete: (id: number, title: string) => void;
  showIssueBadges?: boolean;
}) {
  if (shows.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-3">
        {title} <span className="text-[#E8E0D0]/25">({shows.length})</span>
      </h2>
      <div className="space-y-2">
        {shows.map((show) => {
          const ignored = new Set(show.ignored_health_checks ?? []);
          return (
          <div
            key={show.id}
            className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#E8E0D0]/50 font-mono">{show.date}</span>
                <span className="font-semibold truncate">{show.title}</span>
                {show.announced ? (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-green-400/40 text-green-300">
                    Announced
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/50">
                    Draft
                  </span>
                )}
                {!!show.rsvp_count && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/60 whitespace-nowrap">
                    {show.rsvp_count} RSVP{show.rsvp_count === 1 ? '' : 's'} · {show.guest_count} guest
                    {show.guest_count === 1 ? '' : 's'}
                  </span>
                )}
                {showIssueBadges && !ignored.has('sound') && !show.sound_engineer_name?.trim() && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap">
                    No sound engineer
                  </span>
                )}
                {showIssueBadges && !ignored.has('bands') && (show.band_count ?? 0) < (show.target_band_count ?? 3) && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap">
                    Need {(show.target_band_count ?? 3) - (show.band_count ?? 0)} band
                    {(show.target_band_count ?? 3) - (show.band_count ?? 0) === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-sm">
              <Link
                href={`/shows/${show.slug}`}
                target="_blank"
                className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
              >
                View
              </Link>
              <Link href={`/admin/shows/${show.id}`} className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline">
                Edit
              </Link>
              <button
                onClick={() => onDelete(show.id, show.title)}
                className="text-red-400/70 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}
