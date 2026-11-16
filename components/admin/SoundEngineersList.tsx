'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FORM } from '@/components/night/form';
import { PageHeader, ADMIN_TYPE, buttonClassName } from './ui';

export interface SoundEngineerListItem {
  id: number;
  name: string;
  photo: string | null;
  instagram: string | null;
  contact_email: string | null;
  show_count: number;
}

const inputClass = FORM.field;

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
      <PageHeader
        overline="Crew"
        title="Sound Engineers"
        actions={
          <Link href="/admin/sound-engineers/new" className={buttonClassName('primary', 's')}>
            + New engineer
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
        {filtered.length} of {engineers.length} engineers shown
      </p>

      <div className="space-y-2">
        {filtered.map((engineer) => (
          <div
            key={engineer.id}
            className="flex items-center justify-between gap-4 border border-surface-ink bg-surface-paper hover:bg-surface-paper-shade px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {engineer.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={engineer.photo} alt="" className="w-8 h-8  object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8  bg-surface-paper-shade flex-shrink-0 flex items-center justify-center text-data-caption-13 font-bold text-surface-ink/60">
                  {engineer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-bold truncate">{engineer.name}</span>
              <span className="text-data-caption-13 px-2 py-0.5  border border-surface-ink text-surface-ink/60 flex-shrink-0">
                {engineer.show_count} show{engineer.show_count === 1 ? '' : 's'}
              </span>
              {engineer.contact_email && (
                <span className="text-data-caption-13 text-surface-ink/60 truncate hidden sm:inline">{engineer.contact_email}</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-body-3">
              <Link
                href={`/admin/sound-engineers/${engineer.id}`}
                className={ADMIN_TYPE.link}
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(engineer.id, engineer.name)}
                className="text-accent-red cursor-pointer underline-offset-4 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-surface-ink/60 text-body-3 py-8 text-center">No engineers match this search.</p>
        )}
      </div>
    </div>
  );
}
