'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FORM } from '@/components/night/form';
import { PageHeader, ADMIN_TYPE, buttonClassName } from './ui';

export interface DoorPersonListItem {
  id: number;
  name: string;
  photo: string | null;
  instagram: string | null;
  contact_email: string | null;
  show_count: number;
}

const inputClass = FORM.field;

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
      <PageHeader
        overline="Crew"
        title="Door people"
        actions={
          <Link href="/admin/door-persons/new" className={buttonClassName('primary', 's')}>
            + New door person
          </Link>
        }
      />

      {errorMessage && (
        <div role="alert" className={`${FORM.error} mb-4 flex items-center justify-between gap-3`}>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className={ADMIN_TYPE.link}>
            Dismiss
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

      <p className={`${ADMIN_TYPE.meta} mb-3`}>
        {filtered.length} of {doorPersons.length} door people shown
      </p>

      <div className="space-y-2">
        {filtered.map((doorPerson) => (
          <div
            key={doorPerson.id}
            className="flex items-center justify-between gap-4 border border-surface-ink bg-surface-paper hover:bg-surface-paper-shade px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {doorPerson.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doorPerson.photo} alt="" className="w-8 h-8  object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8  bg-surface-paper-shade flex-shrink-0 flex items-center justify-center text-data-caption-13 font-bold text-surface-ink/60">
                  {doorPerson.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-bold truncate">{doorPerson.name}</span>
              <span className="text-data-caption-13 px-2 py-0.5  border border-surface-ink text-surface-ink/60 flex-shrink-0">
                {doorPerson.show_count} show{doorPerson.show_count === 1 ? '' : 's'}
              </span>
              {doorPerson.contact_email && (
                <span className="text-data-caption-13 text-surface-ink/60 truncate hidden sm:inline">{doorPerson.contact_email}</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-body-3">
              <Link
                href={`/admin/door-persons/${doorPerson.id}`}
                className={ADMIN_TYPE.link}
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(doorPerson.id, doorPerson.name)}
                className="text-accent-red cursor-pointer underline-offset-4 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-surface-ink/60 text-body-3 py-8 text-center">No door people match this search.</p>
        )}
      </div>
    </div>
  );
}
