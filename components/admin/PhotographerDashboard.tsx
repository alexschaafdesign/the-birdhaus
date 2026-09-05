'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { downscaleImage } from '@/lib/downscale-image';
import type { PhotographerQueueItem } from '@/lib/photographers';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// The crew photographer's self-serve widget: edit their own profile (photo /
// Instagram / bio) and work their Queue of assigned shows — uploading photos
// straight to the live gallery for past shows that still need them.
export default function PhotographerDashboard({
  name,
  profileHref,
  initialPhoto,
  initialInstagram,
  initialBio,
  queue,
  readOnly = false,
}: {
  name: string;
  profileHref: string;
  initialPhoto: string | null;
  initialInstagram: string | null;
  initialBio: string | null;
  queue: PhotographerQueueItem[];
  // Admin preview: render exactly what she sees, but disable the actions (they
  // upload/save as the logged-in user, which isn't her).
  readOnly?: boolean;
}) {
  const router = useRouter();

  const [photo, setPhoto] = useState(initialPhoto ?? '');
  const [instagram, setInstagram] = useState(initialInstagram ?? '');
  const [bio, setBio] = useState(initialBio ?? '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Which show is mid-upload, and its progress — keyed by showId.
  const [uploading, setUploading] = useState<{ showId: number; done: number; total: number } | null>(
    null
  );

  async function handlePhotoUpload(file: File) {
    if (readOnly) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setPhotoBusy(true);
    try {
      const prepared = await downscaleImage(file, { maxDim: 1000 });
      const formData = new FormData();
      formData.append('file', prepared);
      const res = await fetch('/api/club/photographer/photo', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      setPhoto(body.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveProfile() {
    if (readOnly) return;
    setSavingProfile(true);
    setProfileMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/club/photographer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagram, bio }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Save failed');
      setProfileMsg('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleShowUpload(showId: number, files: FileList) {
    if (readOnly) return;
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    for (const f of fileArray) {
      if (!f.type.startsWith('image/')) {
        setError('Please choose image files only.');
        return;
      }
    }
    setUploading({ showId, done: 0, total: fileArray.length });
    try {
      for (const file of fileArray) {
        const prepared = await downscaleImage(file, { maxDim: 2400 });
        const formData = new FormData();
        formData.append('file', prepared);
        const res = await fetch(`/api/club/photographer/shows/${showId}/photos`, {
          method: 'POST',
          body: formData,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Upload failed for "${file.name}"`);
        setUploading((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      // Pull fresh queue counts / clear the "needs photos" flag.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  const initials = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <section className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">Your photographer page</h3>
        <Link
          href={profileHref}
          target="_blank"
          className="text-xs text-[#E8E0D0]/60 underline decoration-dotted underline-offset-2 hover:text-[#E8E0D0]"
        >
          View public profile ↗
        </Link>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      {/* Profile self-edit */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E8E0D0]/10 text-lg">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy || readOnly}
            className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10 disabled:opacity-50"
          >
            {photoBusy ? 'Uploading…' : 'Change photo'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoUpload(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex-1 space-y-2">
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="Instagram (handle or URL)"
            disabled={readOnly}
            className={`${inputClass} w-full disabled:opacity-60`}
          />
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio (optional)"
            rows={3}
            disabled={readOnly}
            className={`${inputClass} w-full resize-y disabled:opacity-60`}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile || readOnly}
              className="text-xs border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 disabled:opacity-50"
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
            {profileMsg && <span className="text-xs text-[#E8E0D0]/50">{profileMsg}</span>}
          </div>
        </div>
      </div>

      {/* Queue */}
      <div className="mt-6 border-t border-[#E8E0D0]/10 pt-4">
        <h4 className="mb-3 text-sm font-medium">Your shows</h4>
        {queue.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/55">
            No shows assigned to you yet. When Alex books you for a show, it&apos;ll show up here.
          </p>
        ) : (
          <ul className="divide-y divide-[#E8E0D0]/10">
            {queue.map((item) => (
              <li key={item.showId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/shows/${item.slug}`} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-[#E8E0D0]/50">{formatDate(item.date)}</p>
                </div>

                <div className="flex items-center gap-3">
                  {!item.isPast ? (
                    <span className="rounded-full bg-[#E8E0D0]/10 px-2 py-0.5 text-xs text-[#E8E0D0]/70">
                      Upcoming shoot
                    </span>
                  ) : item.needsPhotos ? (
                    <>
                      <span className="rounded-full bg-[#F5A3A3]/15 px-2 py-0.5 text-xs font-semibold text-[#F5A3A3]">
                        Needs photos
                      </span>
                      <label
                        className={`cursor-pointer text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10 ${
                          uploading || readOnly ? 'pointer-events-none opacity-50' : ''
                        }`}
                      >
                        {uploading?.showId === item.showId
                          ? `Uploading ${uploading.done}/${uploading.total}…`
                          : 'Upload photos'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={!!uploading || readOnly}
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) handleShowUpload(item.showId, files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <span className="rounded-full bg-[#7bb98a]/15 px-2 py-0.5 text-xs font-semibold text-[#bfe6c8]">
                      {item.photoCount} photo{item.photoCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
