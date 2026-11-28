'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FORM } from '@/components/night/form';
import { Panel, PageHeader, Checkbox, ADMIN_TYPE, buttonClassName } from './ui';

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

const inputClass = FORM.field;

export default function BandsList({ initialBands }: { initialBands: BandListItem[] }) {
  const [bands, setBands] = useState<BandListItem[]>(initialBands);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  const scoped = useMemo(
    () => (showAll ? bands : bands.filter((b) => b.show_count > 0)),
    [bands, showAll]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((b) => b.name.toLowerCase().includes(q) || b.slug.includes(q));
  }, [scoped, search]);

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
      <PageHeader
        overline="Bands"
        title="Bands"
        actions={
          <Link href="/admin/bands/new" className={buttonClassName('primary', 's')}>
            + New band
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

      <Panel className="mb-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search name, slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full max-w-sm`}
          />
        </div>

        <Checkbox
          className="mt-3 select-none"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
          label="Include bands with no shows yet"
        />
      </Panel>

      <p className={`${ADMIN_TYPE.meta} mb-3`}>
        {filtered.length} of {scoped.length} bands shown
      </p>

      <div className="space-y-2">
        {filtered.map((band) => (
          <div
            key={band.id}
            className="flex items-center justify-between gap-4 border border-surface-ink bg-surface-paper hover:bg-surface-paper-shade px-4 py-3"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {band.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={band.photo} alt="" className="w-8 h-8  object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8  bg-surface-paper-shade flex-shrink-0" />
              )}
              <span className="font-bold truncate">{band.name}</span>
              <span className="text-data-caption-13 px-2 py-0.5  border border-surface-ink text-surface-ink/60 flex-shrink-0">
                {band.show_count} show{band.show_count === 1 ? '' : 's'}
              </span>
              {band.is_touring && (
                <span className="text-data-caption-13 px-2 py-0.5  border border-surface-ink text-surface-ink/60 flex-shrink-0">
                  Touring{band.hometown ? ` · ${band.hometown}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-body-3">
              <Link href={`/bands/${band.slug}`} target="_blank" className={ADMIN_TYPE.link}>
                View
              </Link>
              <Link href={`/admin/bands/${band.id}`} className={ADMIN_TYPE.link}>
                Edit
              </Link>
              <button
                onClick={() => handleDelete(band.id, band.name)}
                className="text-accent-red cursor-pointer underline-offset-4 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-surface-ink/60 text-body-3 py-8 text-center">No bands match this search.</p>
        )}
      </div>
    </div>
  );
}
