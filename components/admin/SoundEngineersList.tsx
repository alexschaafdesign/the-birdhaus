'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface SoundEngineerListItem {
  id: number;
  name: string;
  photo: string | null;
  instagram: string | null;
  contact_email: string | null;
  show_count: number;
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function SoundEngineersList({
  initialEngineers,
}: {
  initialEngineers: SoundEngineerListItem[];
}) {
  const [engineers, setEngineers] = useState<SoundEngineerListItem[]>(initialEngineers);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return engineers;
    return engineers.filter((e) => e.name.toLowerCase().includes(q));
  }, [engineers, search]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    const prev = engineers;
    setEngineers((list) => list.filter((e) => e.id !== id));
    try {
      const res = await fetch(`/api/admin/sound-engineers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error);
      }
    } catch (err) {
      setEngineers(prev);
      setErrorMessage(err instanceof Error && err.message ? err.message : 'Failed to delete — try again.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">Sound Engineers</h1>
        <Link
          href="/admin/sound-engineers/new"
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors whitespace-nowrap"
        >
          + New engineer
        </Link>
      </div>

      {errorMessage && (
        <div className="mb-4 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <input
        type="text"
        placeholder="Search name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${inputClass} w-full max-w-sm mb-3`}
      />

      <p className="text-xs text-[#E8E0D0]/40 mb-3">
        {filtered.length} of {engineers.length} engineers shown
      </p>

      <div className="space-y-2">
        {filtered.map((engineer) => (
          <div
            key={engineer.id}
            className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] rounded-lg px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {engineer.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={engineer.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#E8E0D0]/10 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-[#E8E0D0]/50">
                  {engineer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-semibold truncate">{engineer.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/50 flex-shrink-0">
                {engineer.show_count} show{engineer.show_count === 1 ? '' : 's'}
              </span>
              {engineer.contact_email && (
                <span className="text-xs text-[#E8E0D0]/40 truncate hidden sm:inline">{engineer.contact_email}</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-sm">
              <Link
                href={`/admin/sound-engineers/${engineer.id}`}
                className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline"
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(engineer.id, engineer.name)}
                className="text-red-400/70 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No engineers match this search.</p>
        )}
      </div>
    </div>
  );
}
