'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FORM } from '@/components/night/form';
import { Panel, PageHeader, StatusMark, Checkbox, ADMIN_TYPE, buttonClassName } from './ui';

export interface BandListItem {
  id: number;
  slug: string;
  name: string;
  instagram: string | null;
  photo: string | null;
  is_touring: boolean;
  hometown: string | null;
  show_count: number;
  unreviewed: boolean;
  // int8 → serialized as a string over JSON; null when the band isn't linked
  // to a Twin Scene canonical record yet.
  twin_scene_band_id: string | number | null;
}

const inputClass = FORM.field;

export default function BandsList({ initialBands }: { initialBands: BandListItem[] }) {
  const router = useRouter();
  const [bands, setBands] = useState<BandListItem[]>(initialBands);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unreviewed'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pushingId, setPushingId] = useState<number | 'all' | null>(null);

  const unreviewedCount = useMemo(() => bands.filter((b) => b.unreviewed).length, [bands]);
  // Bands that played a show but aren't linked to a Twin Scene record — the
  // ones "Push to Twin Scene" acts on (bare orphans with no shows are excluded).
  const unlinkedWithShows = useMemo(
    () => bands.filter((b) => b.twin_scene_band_id == null && b.show_count > 0),
    [bands]
  );

  const scoped = useMemo(() => {
    // Unreviewed bands are almost always freshly auto-created with 0 shows,
    // so this tab ignores the "show all" scoping entirely — otherwise they'd
    // never appear without also checking that box.
    if (filter === 'unreviewed') return bands.filter((b) => b.unreviewed);
    return showAll ? bands : bands.filter((b) => b.show_count > 0);
  }, [bands, showAll, filter]);

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

  async function handleMarkReviewed(id: number) {
    setBands((prev) => prev.map((b) => (b.id === id ? { ...b, unreviewed: false } : b)));
    try {
      const res = await fetch(`/api/admin/bands/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unreviewed: false }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBands((prev) => prev.map((b) => (b.id === id ? { ...b, unreviewed: true } : b)));
      setErrorMessage('Failed to mark reviewed — refresh and try again.');
    }
  }

  async function handleSyncTwinScene() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch('/api/admin/bands/sync-twinscene', { method: 'POST' });
      if (!res.ok) throw new Error();
      const result: { checked: number; updated: number } = await res.json();
      setSyncStatus(
        result.updated > 0
          ? `Filled in fields on ${result.updated} of ${result.checked} linked band(s).`
          : `Checked ${result.checked} linked band(s) — nothing to fill in.`
      );
      if (result.updated > 0) router.refresh();
    } catch {
      setSyncStatus('Sync failed — check TWIN_SCENE_API_KEY / TWIN_SCENE_API_URL and try again.');
    } finally {
      setSyncing(false);
    }
  }

  // Create-and-link unlinked band(s) in Twin Scene. `id` pushes one; omit it to
  // push every unlinked band that has a show. Server-side, so the API key works.
  async function handlePush(id?: number) {
    setPushingId(id ?? 'all');
    setSyncStatus(null);
    try {
      const res = await fetch('/api/admin/bands/push-to-twinscene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id != null ? { id } : {}),
      });
      if (!res.ok) throw new Error();
      const result: { total: number; linked: number; failed: number } = await res.json();
      setSyncStatus(
        result.failed > 0
          ? `Linked ${result.linked} of ${result.total} — ${result.failed} failed (check server logs).`
          : `Linked ${result.linked} band(s) to Twin Scene.`
      );
      router.refresh();
    } catch {
      setSyncStatus('Push failed — check TWIN_SCENE_API_KEY / TWIN_SCENE_API_URL and try again.');
    } finally {
      setPushingId(null);
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
        <div className="flex gap-2">
          {(['all', 'unreviewed'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={buttonClassName(filter === option ? 'primary' : 'secondary', 's')}
            >
              {option === 'all' ? 'All' : `Unreviewed (${unreviewedCount})`}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search name, slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full max-w-sm`}
          />
          {unlinkedWithShows.length > 0 && (
            <button
              onClick={() => handlePush()}
              disabled={pushingId !== null}
              className={`ml-auto ${buttonClassName('secondary', 's')}`}
              title="Create these bands in Twin Scene and link them"
            >
              {pushingId === 'all' ? 'Pushing…' : `Push ${unlinkedWithShows.length} unlinked to Twin Scene`}
            </button>
          )}
          <button
            onClick={handleSyncTwinScene}
            disabled={syncing}
            className={`${unlinkedWithShows.length > 0 ? '' : 'ml-auto '}${buttonClassName('secondary', 's')}`}
          >
            {syncing ? 'Syncing…' : 'Sync from Twin Scene'}
          </button>
        </div>

        <Checkbox
          className="mt-3 select-none"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
          label="Show all Twin Cities bands (in-progress)"
        />

        {syncStatus && (
          <p role="status" className={`${ADMIN_TYPE.meta} mt-2`}>
            {syncStatus}
          </p>
        )}
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
              {band.unreviewed && (
                <StatusMark tone="attention">Unreviewed</StatusMark>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-body-3">
              {band.unreviewed && (
                <button
                  onClick={() => handleMarkReviewed(band.id)}
                  className={ADMIN_TYPE.link}
                >
                  Mark reviewed
                </button>
              )}
              {band.twin_scene_band_id == null && band.show_count > 0 && (
                <button
                  onClick={() => handlePush(band.id)}
                  disabled={pushingId !== null}
                  className={`${ADMIN_TYPE.link} disabled:opacity-50`}
                  title="Create in Twin Scene and link"
                >
                  {pushingId === band.id ? 'Pushing…' : 'Push to Twin Scene'}
                </button>
              )}
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
