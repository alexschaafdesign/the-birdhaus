'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface BandListItem {
  id: number;
  slug: string;
  name: string;
  instagram: string | null;
  photo: string | null;
  is_touring: boolean;
  hometown: string | null;
  show_count: number;
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function BandsList({ initialBands }: { initialBands: BandListItem[] }) {
  const [bands, setBands] = useState<BandListItem[]>(initialBands);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bands;
    return bands.filter((b) => b.name.toLowerCase().includes(q) || b.slug.includes(q));
  }, [bands, search]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBands((prev) => prev.filter((b) => b.id !== id));
    try {
      const res = await fetch(`/api/admin/bands/${id}`, { method: 'DELETE' });
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
          placeholder="Search name, slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} w-full max-w-sm`}
        />
        <Link
          href="/admin/bands/new"
          className="ml-auto border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
        >
          + New band
        </Link>
      </div>

      <p className="text-xs text-[#E8E0D0]/40 mb-3">
        {filtered.length} of {bands.length} bands shown
      </p>

      <div className="space-y-2">
        {filtered.map((band) => (
          <div
            key={band.id}
            className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {band.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={band.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#E8E0D0]/10 flex-shrink-0" />
              )}
              <span className="font-semibold truncate">{band.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/50 flex-shrink-0">
                {band.show_count} show{band.show_count === 1 ? '' : 's'}
              </span>
              {band.is_touring && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/50 flex-shrink-0">
                  Touring{band.hometown ? ` · ${band.hometown}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-sm">
              <Link href={`/bands/${band.slug}`} target="_blank" className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]">
                View
              </Link>
              <Link href={`/admin/bands/${band.id}`} className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline">
                Edit
              </Link>
              <button
                onClick={() => handleDelete(band.id, band.name)}
                className="text-red-400/70 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No bands match this search.</p>
        )}
      </div>
    </div>
  );
}
