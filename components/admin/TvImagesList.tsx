'use client';

import { useRef, useState } from 'react';
import type { TvImage } from '@/lib/tv-images';
import { downscaleImage } from '@/lib/downscale-image';
import TvPresetBar from './TvPresetBar';
import ShowFlyerPicker from './ShowFlyerPicker';

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch('/api/admin/tv-images', { cache: 'no-store' });
    if (res.ok) setImages(await res.json());
  }

  async function uploadOne(file: File): Promise<void> {
    // Shrink big originals in the browser first so a full-res phone photo or
    // screenshot slips under the upload cap; the server still does the final
    // resize. Only fails if it's somehow still too big after that.
    const prepared = await downscaleImage(file);
    if (prepared.size > MAX_SIZE_BYTES) {
      throw new Error('too large even after resizing');
    }
    const formData = new FormData();
    formData.append('file', prepared);
    formData.append('folder', 'tv');
    const up = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
    const upBody = await up.json().catch(() => null);
    if (!up.ok) throw new Error(upBody?.error || 'upload failed');

    const create = await fetch('/api/admin/tv-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: upBody.url }),
    });
    if (!create.ok) throw new Error('could not add to pool');
  }

  async function handleFiles(files: File[]) {
    setError(null);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('Please choose image files.');
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: imageFiles.length });
    // Sequential so pool order matches the order you picked them and progress
    // advances one at a time; one bad file is reported but doesn't sink the rest.
    const failures: string[] = [];
    try {
      for (const file of imageFiles) {
        try {
          await uploadOne(file);
        } catch (err) {
          failures.push(`${file.name} (${err instanceof Error ? err.message : 'failed'})`);
        } finally {
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      }
      await refresh();
      if (failures.length > 0) {
        setError(
          `Couldn’t upload ${failures.length} of ${imageFiles.length}: ${failures.join(', ')}`
        );
      }
    } finally {
      setUploading(false);
      setProgress(null);
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
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="text-[#E8E0D0]">
      {pickerOpen && (
        <ShowFlyerPicker onClose={() => setPickerOpen(false)} onAdded={refresh} />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <h2 className="text-xl font-bold">TV Screen — Idle Images</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPickerOpen(true)} className={btn}>
            + From show flyers
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={btn}
          >
            {uploading
              ? progress
                ? `Uploading ${progress.done}/${progress.total}…`
                : 'Uploading…'
              : '+ Add images'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) handleFiles(files);
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
      <div className="mb-4">
        <TvPresetBar category="screensaver" />
      </div>
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
