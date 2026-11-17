'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FORM } from '@/components/night/form';
import { PageHeader, ADMIN_TYPE, buttonClassName } from './ui';

export interface PhotographerListItem {
  id: number;
  name: string;
  photo: string | null;
  instagram: string | null;
  contact_email: string | null;
  show_count: number;
}

const inputClass = FORM.field;

export default function PhotographersList({
  initialPhotographers,
}: {
  initialPhotographers: PhotographerListItem[];
}) {
  const [photographers, setPhotographers] = useState<PhotographerListItem[]>(initialPhotographers);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return photographers;
    return photographers.filter((p) => p.name.toLowerCase().includes(q));
  }, [photographers, search]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    const prev = photographers;
    setPhotographers((list) => list.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/admin/photographers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error);
      }
    } catch (err) {
      setPhotographers(prev);
      setErrorMessage(err instanceof Error && err.message ? err.message : 'Failed to delete — try again.');
    }
  }

  return (
    <div>
      <PageHeader
        overline="Crew"
        title="Photographers"
        actions={
          <Link href="/admin/photographers/new" className={buttonClassName('primary', 's')}>
            + New photographer
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
        {filtered.length} of {photographers.length} photographers shown
      </p>

      <div className="space-y-2">
        {filtered.map((photographer) => (
          <div
            key={photographer.id}
            className="flex items-center justify-between gap-4 border border-surface-ink bg-surface-paper hover:bg-surface-paper-shade px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {photographer.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photographer.photo} alt="" className="w-8 h-8  object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8  bg-surface-paper-shade flex-shrink-0 flex items-center justify-center text-data-caption-13 font-bold text-surface-ink/60">
                  {photographer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-bold truncate">{photographer.name}</span>
              <span className="text-data-caption-13 px-2 py-0.5  border border-surface-ink text-surface-ink/60 flex-shrink-0">
                {photographer.show_count} show{photographer.show_count === 1 ? '' : 's'}
              </span>
              {photographer.contact_email && (
                <span className="text-data-caption-13 text-surface-ink/60 truncate hidden sm:inline">{photographer.contact_email}</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-body-3">
              <Link
                href={`/admin/photographers/${photographer.id}`}
                className={ADMIN_TYPE.link}
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(photographer.id, photographer.name)}
                className="text-accent-red cursor-pointer underline-offset-4 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-surface-ink/60 text-body-3 py-8 text-center">No photographers match this search.</p>
        )}
      </div>
    </div>
  );
}
