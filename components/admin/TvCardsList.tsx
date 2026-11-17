'use client';

import { useRef, useState } from 'react';
import type { TvCard } from '@/lib/tv-program';
import { downscaleImage } from '@/lib/downscale-image';
import TvPresetBar from './TvPresetBar';

// Manager for global announcement cards (070_tv_program.sql), shown on the tube
// in 'cards' mode. Each card: a headline, optional subtext, optional image.
// Edit inline, park/unpark, reorder, delete.

const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const btn =
  'text-data-caption-13 border border-surface-ink  px-3 py-1.5 hover:bg-surface-paper-shade disabled:opacity-40 whitespace-nowrap';
const field =
  'bg-transparent border border-surface-ink  px-3 py-1.5 text-body-3 focus:outline-none focus:border-accent-red placeholder:text-surface-ink/45';

export default function TvCardsList({
  initialCards,
  showId = null,
}: {
  initialCards: TvCard[];
  // null = global cards; a number = that show's cards.
  showId?: number | null;
}) {
  const [cards, setCards] = useState<TvCard[]>(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Local text edits so typing doesn't fight the list refresh; commit on blur.
  const [edits, setEdits] = useState<Record<number, { headline?: string; subtext?: string }>>({});
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const scopeQs = showId != null ? `?showId=${showId}` : '';

  async function refresh() {
    const res = await fetch(`/api/admin/tv-cards${scopeQs}`, { cache: 'no-store' });
    if (res.ok) setCards(await res.json());
  }

  async function addCard() {
    setError(null);
    const res = await fetch('/api/admin/tv-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline: 'New announcement', showId }),
    });
    if (res.ok) await refresh();
    else setError('Could not add card');
  }

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/tv-cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) await refresh();
    else setError('Could not save card');
  }

  async function remove(id: number) {
    if (!confirm('Delete this card?')) return;
    const res = await fetch(`/api/admin/tv-cards/${id}`, { method: 'DELETE' });
    if (res.ok) setCards((prev) => prev.filter((c) => c.id !== id));
  }

  async function uploadImage(id: number, file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setBusyId(id);
    try {
      const prepared = await downscaleImage(file);
      if (prepared.size > MAX_SIZE_BYTES) throw new Error('Image is too large even after resizing');
      const formData = new FormData();
      formData.append('file', prepared);
      formData.append('folder', 'tv');
      const up = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
      const upBody = await up.json().catch(() => null);
      if (!up.ok) throw new Error(upBody?.error || 'Upload failed');
      await patch(id, { image: upBody.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusyId(null);
    }
  }

  const val = (c: TvCard, k: 'headline' | 'subtext') =>
    edits[c.id]?.[k] ?? (k === 'headline' ? c.headline : c.subtext ?? '');
  const setEdit = (id: number, k: 'headline' | 'subtext', v: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));

  return (
    <div className="text-surface-ink">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">Announcement cards</h3>
        <button type="button" onClick={addCard} className={btn}>
          + Add card
        </button>
      </div>
      <p className="text-data-caption-13 text-surface-ink/60 mb-4 max-w-2xl">
        Rotated on the tube in “Announcement cards” mode — a headline, optional subtext, optional image.
      </p>
      <div className="mb-4">
        <TvPresetBar category="cards" showId={showId} />
      </div>
      {error && <p className="text-body-3 text-accent-red mb-3">{error}</p>}

      {cards.length === 0 ? (
        <p className="text-body-3 text-surface-ink/60 border border-dashed border-surface-ink  px-4 py-6 text-center">
          No cards yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-start gap-4 border border-surface-ink  p-3 ${
                c.active ? '' : 'opacity-50'
              }`}
            >
              <div className="flex-shrink-0">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="w-24 h-16 object-cover bg-surface-paper-shade" />
                ) : (
                  <div className="w-24 h-16 bg-surface-paper-shade border border-dashed border-surface-ink" />
                )}
                <button
                  type="button"
                  onClick={() => fileInputs.current[c.id]?.click()}
                  disabled={busyId === c.id}
                  className="text-data-label-10-small text-surface-ink/60 hover:text-accent-red mt-1 w-24 text-center block"
                >
                  {busyId === c.id ? 'Uploading…' : c.image ? 'Replace image' : 'Add image'}
                </button>
                <input
                  ref={(el) => {
                    fileInputs.current[c.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(c.id, file);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  value={val(c, 'headline')}
                  placeholder="Headline"
                  onChange={(e) => setEdit(c.id, 'headline', e.target.value)}
                  onBlur={() => {
                    const next = val(c, 'headline').trim();
                    if (next && next !== c.headline) patch(c.id, { headline: next });
                  }}
                  className={`${field} w-full font-bold`}
                />
                <input
                  value={val(c, 'subtext')}
                  placeholder="Subtext (optional)"
                  onChange={(e) => setEdit(c.id, 'subtext', e.target.value)}
                  onBlur={() => {
                    const next = val(c, 'subtext').trim();
                    if (next !== (c.subtext ?? '')) patch(c.id, { subtext: next });
                  }}
                  className={`${field} w-full`}
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => patch(c.id, { move: 'up' })}
                  disabled={i === 0}
                  className={btn}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => patch(c.id, { move: 'down' })}
                  disabled={i === cards.length - 1}
                  className={btn}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button type="button" onClick={() => patch(c.id, { active: !c.active })} className={btn}>
                  {c.active ? 'Active' : 'Parked'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="text-data-caption-13 border border-accent-red text-accent-red  px-3 py-1.5 hover:bg-surface-paper-shade"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
