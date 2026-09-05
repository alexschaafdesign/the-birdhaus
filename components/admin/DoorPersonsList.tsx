'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface DoorPersonListItem {
  id: number;
  name: string;
  photo: string | null;
  instagram: string | null;
  contact_email: string | null;
  show_count: number;
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function DoorPersonsList({
  initialDoorPersons,
}: {
  initialDoorPersons: DoorPersonListItem[];
}) {
  const [doorPersons, setDoorPersons] = useState<DoorPersonListItem[]>(initialDoorPersons);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doorPersons;
    return doorPersons.filter((p) => p.name.toLowerCase().includes(q));
  }, [doorPersons, search]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    const prev = doorPersons;
    setDoorPersons((list) => list.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/admin/door-persons/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error);
      }
    } catch (err) {
      setDoorPersons(prev);
      setErrorMessage(err instanceof Error && err.message ? err.message : 'Failed to delete — try again.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">Door people</h1>
        <Link
          href="/admin/door-persons/new"
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors whitespace-nowrap"
        >
          + New door person
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
        {filtered.length} of {doorPersons.length} door people shown
      </p>

      <div className="space-y-2">
        {filtered.map((doorPerson) => (
          <div
            key={doorPerson.id}
            className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] rounded-lg px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {doorPerson.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doorPerson.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#E8E0D0]/10 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-[#E8E0D0]/50">
                  {doorPerson.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-semibold truncate">{doorPerson.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/50 flex-shrink-0">
                {doorPerson.show_count} show{doorPerson.show_count === 1 ? '' : 's'}
              </span>
              {doorPerson.contact_email && (
                <span className="text-xs text-[#E8E0D0]/40 truncate hidden sm:inline">{doorPerson.contact_email}</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-sm">
              <Link
                href={`/admin/door-persons/${doorPerson.id}`}
                className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline"
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(doorPerson.id, doorPerson.name)}
                className="text-red-400/70 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No door people match this search.</p>
        )}
      </div>
    </div>
  );
}
