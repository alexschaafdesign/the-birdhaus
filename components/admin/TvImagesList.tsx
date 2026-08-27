'use client';

import { useRef, useState } from 'react';
import type { TvImage } from '@/lib/tv-images';
import { downscaleImage } from '@/lib/downscale-image';

// Manager for the /tv idle-image pool (069_tv_images.sql). Upload images, set
// an optional caption, park/unpark, reorder, delete. These images cycle on the
// in-venue CRT only during dead air — no show tonight, before doors, after the
// last set.

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — mirrors app/api/admin/uploads/route.ts

const btn =
  'text-xs border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 disabled:opacity-40 whitespace-nowrap';

export default function TvImagesList({ initialImages }: { initialImages: TvImage[] }) {
  const [images, setImages] = useState<TvImage[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch('/api/admin/tv-images', { cache: 'no-store' });
    if (res.ok) setImages(await res.json());
  }

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setUploading(true);
    try {
      // Shrink big originals in the browser first so a full-res phone photo or
      // screenshot slips under the upload cap; the server still does the final
      // resize. Only rejects if it's somehow still too big after that.
      const prepared = await downscaleImage(file);
      if (prepared.size > MAX_SIZE_BYTES) {
        setError('Image is too large even after resizing (max 8MB).');
        return;
      }
      const formData = new FormData();
      formData.append('file', prepared);
      formData.append('folder', 'tv');
      const up = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
      const upBody = await up.json().catch(() => null);
      if (!up.ok) throw new Error(upBody?.error || 'Upload failed');

      const create = await fetch('/api/admin/tv-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: upBody.url }),
      });
      if (!create.ok) throw new Error('Could not add image to the pool');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/tv-images/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) await refresh();
  }

  async function remove(id: number) {
    if (!confirm('Remove this image from the TV pool?')) return;
    const res = await fetch(`/api/admin/tv-images/${id}`, { method: 'DELETE' });
    if (res.ok) setImages((prev) => prev.filter((img) => img.id !== id));
  }

  // Inline caption editing: keep local edits in a map so typing doesn't fight
  // the list refresh; commit on blur.
  const [captions, setCaptions] = useState<Record<number, string>>({});
  const captionValue = (img: TvImage) =>
    captions[img.id] ?? img.caption ?? '';

  const activeCount = images.filter((img) => img.active).length;

  return (
    <div className="text-[#E8E0D0]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <h2 className="text-xl font-bold">TV Screen — Idle Images</h2>
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={btn}
          >
            {uploading ? 'Uploading…' : '+ Add image'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <p className="text-sm text-[#E8E0D0]/50 mb-4 max-w-2xl">
        These images are the in-venue TV’s screensaver: during idle stretches — nights
        with no show, before doors, and after the last set — one drifts and bounces
        around the tube, swapping to the next each time it hits an edge. They never
        interrupt a live show.
        {images.length > 0 && (
          <> {activeCount} of {images.length} active.</>
        )}
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {images.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/40 border border-dashed border-[#E8E0D0]/20 rounded px-4 py-8 text-center">
          No images yet. Add a few and they’ll fill the tube’s dead air.
        </p>
      ) : (
        <ul className="space-y-3">
          {images.map((img, i) => (
            <li
              key={img.id}
              className={`flex items-center gap-4 border border-[#E8E0D0]/20 rounded p-3 ${
                img.active ? '' : 'opacity-50'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="w-24 h-16 object-cover rounded bg-black/40 flex-shrink-0"
              />
              <input
                value={captionValue(img)}
                placeholder="Caption (optional)"
                onChange={(e) =>
                  setCaptions((prev) => ({ ...prev, [img.id]: e.target.value }))
                }
                onBlur={() => {
                  const next = captionValue(img).trim();
                  if (next !== (img.caption ?? '')) patch(img.id, { caption: next });
                }}
                className="flex-1 min-w-0 bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30"
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => patch(img.id, { move: 'up' })}
                  disabled={i === 0}
                  className={btn}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => patch(img.id, { move: 'down' })}
                  disabled={i === images.length - 1}
                  className={btn}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => patch(img.id, { active: !img.active })}
                  className={btn}
                >
                  {img.active ? 'Active' : 'Parked'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  className="text-xs border border-red-500/40 text-red-300 rounded px-3 py-1.5 hover:bg-red-500/10"
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
